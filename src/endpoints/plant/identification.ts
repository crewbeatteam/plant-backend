import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { PlantIdentificationFormDataSchema, PlantIdentificationResponseSchema } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { validateFileArray } from "../../utils/fileValidation";
import { storeIdentificationRequest } from "../../services/plantIdentification";
import { ImageIdentifierFactory } from "../../services/imageIdentifier/factory";
import { createImageStorage } from "../../services/imageStorage";

// Helper function to parse FormData (PlantNet style with images param)
async function parseFormData(formData: FormData) {
  const images: File[] = [];
  const data: any = {};
  
  for (const [key, value] of formData.entries()) {
    if (key === "images") {
      if (value instanceof File) {
        images.push(value);
      }
    } else {
      // Handle other form fields
      if (typeof value === "string") {
        // Handle JSON object fields (like suggestion_filter)
        if (key === "suggestion_filter") {
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value; // If JSON parsing fails, keep as string
          }
        }
        // Parse boolean and numeric values
        else if (value === "true") {
          data[key] = true;
        } else if (value === "false") {
          data[key] = false;
        } else if (!isNaN(Number(value)) && value !== "") {
          data[key] = Number(value);
        } else {
          data[key] = value;
        }
      }
    }
  }
  
  data.images = images;
  return data;
}

// Helper function to upload images to R2 and return image data
async function processImages(files: File[], imageStorage: any): Promise<{ imageKeys: string[], imageUrls: string[], files: File[], imageMetadata: any[] }> {
  const imageKeys: string[] = [];
  const imageUrls: string[] = [];
  const imageMetadata: any[] = [];
  
  for (const file of files) {
    // Upload to R2
    const uploadResult = await imageStorage.uploadImage(file);
    const imageUrl = await imageStorage.getImageUrl(uploadResult.imageKey);
    
    imageKeys.push(uploadResult.imageKey);
    imageUrls.push(imageUrl);
    imageMetadata.push({
      imageKey: uploadResult.imageKey,
      contentHash: uploadResult.contentHash,
      fileSize: uploadResult.fileSize,
      contentType: uploadResult.contentType,
      originalFilename: file.name
    });
  }
  
  return { imageKeys, imageUrls, files, imageMetadata };
}

export class PlantIdentification extends OpenAPIRoute {
  schema = {
    tags: ["Plant Identification"],
    summary: "Identify plant species from images",
    description: "Submit images for plant species identification using AI",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: PlantIdentificationFormDataSchema,
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

      // Check content type
      const contentType = c.req.header("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return c.json({
          error: "Invalid content type",
          details: ["Content-Type must be multipart/form-data for file uploads"]
        }, 400);
      }

      // Parse and validate FormData request
      const formData = await c.req.formData();
      const parsedData = await parseFormData(formData);
      const validation = PlantIdentificationFormDataSchema.safeParse(parsedData);
      
      if (!validation.success) {
        return c.json({
          error: "Invalid request parameters",
          details: validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
        }, 400);
      }
      
      const request = validation.data;

      // Initialize image storage service
      const imageStorage = createImageStorage(c.env);
      
      // Process images: upload to R2
      const { imageKeys, imageUrls, files, imageMetadata } = await processImages(request.images as File[], imageStorage);

      // Validate image files
      const imageValidation = validateFileArray(files);
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

      console.log("identifier: " + identifier.getName());

      // Transform our request format to ImageIdentifier interface
      const identificationRequest = {
        images: imageUrls, // Use R2 URLs instead of base64
        files: files, // Pass original files for providers that need them
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

      console.log("=== IDENTIFICATION RESPONSE SENT TO CLIENT ===");
      console.log(JSON.stringify(response, null, 2));


      // Store the request and response in database
      // Create a request object with R2 image data for database storage
      const requestForStorage = {
        ...request,
        imageKeys,
        imageUrls,
        imageMetadata,
        primaryImageKey: imageKeys[0] || null,
        primaryImageUrl: imageUrls[0] || null
      };
      await storeIdentificationRequest(c.env.DB, apiKeyInfo.id, requestForStorage, response);

      return c.json(response, 200);

    } catch (error) {
      console.error("Plant identification error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
}
