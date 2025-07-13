import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { HealthAssessmentRequestSchema, HealthAssessmentResponseSchema } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { validateImageArray } from "../../utils/image";
import { generateHealthAssessment, storeHealthAssessment } from "../../services/healthAssessment";

export class PlantHealthAssessment extends OpenAPIRoute {
  schema = {
    tags: ["Plant Health"],
    summary: "Assess plant health and detect diseases",
    description: "Submit images for plant health assessment and disease detection using AI",
    request: {
      body: {
        content: {
          "application/json": {
            schema: HealthAssessmentRequestSchema,
          },
        },
      },
      headers: z.object({
        "Api-Key": z.string().describe("API key for authentication"),
      }),
    },
    responses: {
      "200": {
        description: "Health assessment completed successfully",
        content: {
          "application/json": {
            schema: HealthAssessmentResponseSchema,
          },
        },
      },
      "400": {
        description: "Invalid request parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              details: z.array(z.string()).optional(),
            }),
          },
        },
      },
      "401": {
        description: "Authentication failed",
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
      // Apply authentication middleware
      const authResponse = await apiKeyAuth(c, async () => {
        return null; // Continue to handler
      });
      
      // If authentication middleware returned a response, return it
      if (authResponse) {
        return authResponse;
      }

      // Get API key info from context (set by middleware)
      const apiKeyInfo = c.get("apiKey");
      if (!apiKeyInfo) {
        return c.json({ error: "Authentication failed" }, 401);
      }

      // Parse and validate request body
      const body = await c.req.json();
      const validation = HealthAssessmentRequestSchema.safeParse(body);
      
      if (!validation.success) {
        return c.json({
          error: "Invalid request parameters",
          details: validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
        }, 400);
      }

      const request = validation.data;

      // Validate images
      const imageValidation = validateImageArray(request.images);
      if (!imageValidation.isValid) {
        return c.json({
          error: "Invalid images",
          details: imageValidation.errors
        }, 400);
      }

      // Generate unique request ID
      const requestId = Date.now() + Math.floor(Math.random() * 1000);

      // Generate health assessment
      const response = await generateHealthAssessment(request, requestId);

      // Store the request and response in database
      await storeHealthAssessment(c.env.DB, apiKeyInfo.id, request, response);

      return c.json(response, 200);

    } catch (error) {
      console.error("Health assessment error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
}