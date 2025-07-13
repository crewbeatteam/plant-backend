import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { PlantIdentificationRequestSchema, PlantIdentificationResponseSchema } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { validateImageArray } from "../../utils/image";
import { storeIdentificationRequest } from "../../services/plantIdentification";
import { ImageIdentifierFactory } from "../../services/imageIdentifier/factory";

export class PlantIdentification extends OpenAPIRoute {
  schema = {
    tags: ["Plant Identification"],
    summary: "Identify plant species from images",
    description: "Submit images for plant species identification using AI",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PlantIdentificationRequestSchema,
          },
        },
      },
      headers: z.object({
        "Api-Key": z.string().describe("API key for authentication"),
      }),
    },
    responses: {
      "200": {
        description: "Plant identification completed successfully",
        content: {
          "application/json": {
            schema: PlantIdentificationResponseSchema,
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
      const validation = PlantIdentificationRequestSchema.safeParse(body);
      
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

      // Create ImageIdentifier instance from environment variables
      const factory = ImageIdentifierFactory.fromEnvironment(c.env);
      const identifier = await factory.createBestAvailableIdentifier();

      // Transform our request format to ImageIdentifier interface
      const identificationRequest = {
        images: request.images,
        latitude: request.latitude,
        longitude: request.longitude,
        classification_level: request.classification_level,
        similar_images: request.similar_images,
        language: request.language
      };

      // Perform identification using the selected provider
      const identificationResult = await identifier.identify(identificationRequest);

      // Transform the result to our API response format
      const response = {
        access_token: requestId.toString(),
        status: "COMPLETED",
        model_version: "1.0.0",
        custom_id: request.custom_id || null,
        input: {
          latitude: request.latitude || null,
          longitude: request.longitude || null,
          similar_images: request.similar_images || false,
          classification_level: request.classification_level || "species",
          language: request.language || "en"
        },
        result: identificationResult
      };

      // Store the request and response in database
      await storeIdentificationRequest(c.env.DB, apiKeyInfo.id, request, response);

      return c.json(response, 200);

    } catch (error) {
      console.error("Plant identification error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
}