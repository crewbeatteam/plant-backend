import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { createApiKey } from "../../middleware/auth";

export class CreateApiKey extends OpenAPIRoute {
  schema = {
    tags: ["API Management"],
    summary: "Create a new API key",
    description: `
Generate a new API key for accessing the Plant.ID API. Each API key provides secure access to all endpoints and includes usage tracking.

## API Key Management

### Key Properties
- **Unique identifier**: Each key has a unique ID for tracking
- **Descriptive naming**: Assign meaningful names for organization
- **Usage tracking**: Monitor consumption per key
- **Secure generation**: Cryptographically secure random keys

### Best Practices
- Use descriptive names (e.g., "Mobile App", "Web Dashboard", "Testing")
- Store keys securely in environment variables
- Never commit keys to version control
- Rotate keys regularly for security
- Create separate keys for different applications/environments

### Security Notes
- API keys are displayed only once during creation
- Keys cannot be retrieved after creation (only regenerated)
- Keep keys confidential and secure
- Monitor usage regularly for unexpected activity

**Important**: This is an admin endpoint and should be protected in production environments.
    `.trim(),
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(100).describe("Descriptive name for the API key"),
            }),
            examples: {
              mobile_app: {
                summary: "Mobile app API key",
                description: "Create API key for mobile application",
                value: {
                  name: "Mobile App Production"
                }
              },
              development: {
                summary: "Development API key",
                description: "Create API key for development/testing",
                value: {
                  name: "Development Testing"
                }
              },
              web_dashboard: {
                summary: "Web dashboard API key",
                description: "Create API key for web dashboard",
                value: {
                  name: "Web Dashboard v2.1"
                }
              }
            }
          },
        },
      },
    },
    responses: {
      "201": {
        description: "API key created successfully",
        content: {
          "application/json": {
            schema: z.object({
              id: z.number(),
              name: z.string(),
              api_key: z.string(),
              created_at: z.string(),
            }),
            examples: {
              created_key: {
                summary: "Successfully created API key",
                description: "Example response when API key is created successfully",
                value: {
                  id: 42,
                  name: "Mobile App Production",
                  api_key: "sk_live_1234567890abcdef1234567890abcdef12345678",
                  created_at: "2024-01-15T10:30:00.000Z"
                }
              }
            }
          },
        },
      },
      "400": {
        description: "Invalid request parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      // Parse and validate request body
      const body = await c.req.json();
      const validation = z.object({
        name: z.string().min(1).max(100),
      }).safeParse(body);
      
      if (!validation.success) {
        return c.json({
          error: "Invalid request parameters: " + validation.error.issues[0].message
        }, 400);
      }

      const { name } = validation.data;

      // Create new API key
      const { key, id } = await createApiKey(c.env.DB, name);

      return c.json({
        id,
        name,
        api_key: key,
        created_at: new Date().toISOString(),
      }, 201);

    } catch (error) {
      console.error("API key creation error:", error);
      return c.json({ error: "Failed to create API key" }, 500);
    }
  }
}