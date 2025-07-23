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
    description: `
Submit images for plant species identification using AI. This endpoint accepts up to 5 images and returns detailed identification results including confidence scores, similar images, and taxonomic information.

## Usage Examples

### Basic Identification
Upload 1-3 clear images of the plant from different angles (leaves, flowers, overall structure) for best results.

### Advanced Parameters
- Use \`latitude\` and \`longitude\` for location-based filtering
- Set \`classification_level\` to "species" for detailed identification or "genus" for broader classification  
- Enable \`similar_images\` to get visual references in the response
- Specify \`language\` for localized common names

## Image Requirements
- **Formats**: JPEG, PNG, WebP
- **Size**: 100KB - 10MB per image
- **Resolution**: Minimum 300x300px, recommended 1024x1024px
- **Quality**: Clear, well-lit images with good focus
- **Content**: Plant should occupy at least 50% of the image

## Response Time
Typical response time is 2-10 seconds depending on the selected AI provider and image complexity.
    `.trim(),
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: PlantIdentificationFormDataSchema,
            examples: {
              basic_request: {
                summary: "Basic plant identification",
                description: "Simple identification request with just images",
                value: {
                  images: ["[binary image data]"],
                  classification_level: "species",
                  language: "en"
                }
              },
              detailed_request: {
                summary: "Detailed identification with location",
                description: "Complete request with location data and similar images",
                value: {
                  images: ["[binary image data]", "[binary image data]"],
                  latitude: 37.7749,
                  longitude: -122.4194,
                  classification_level: "species",
                  similar_images: true,
                  language: "en",
                  custom_id: "my_plant_001"
                }
              }
            }
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
            examples: {
              successful_identification: {
                summary: "Successful plant identification",
                description: "Example response with high-confidence species identification",
                value: {
                  access_token: "abc123def456",
                  status: "COMPLETED",
                  model_version: "1.0.0",
                  custom_id: "my_plant_001",
                  input: {
                    latitude: 37.7749,
                    longitude: -122.4194,
                    similar_images: true,
                    classification_level: "species",
                    language: "en"
                  },
                  result: {
                    is_plant: {
                      probability: 0.95,
                      binary: true,
                      threshold: 0.5
                    },
                    classification: {
                      suggestions: [
                        {
                          id: "monstera_deliciosa",
                          name: "Monstera deliciosa",
                          probability: 0.89,
                          confirmed: false,
                          similar_images: [
                            {
                              id: "img_001",
                              url: "https://example.com/similar1.jpg",
                              similarity: 0.92
                            }
                          ],
                          details: {
                            common_names: ["Swiss Cheese Plant", "Split-leaf Philodendron"],
                            taxonomy: {
                              kingdom: "Plantae",
                              phylum: "Tracheophyta",
                              class: "Liliopsida",
                              order: "Alismatales",
                              family: "Araceae",
                              genus: "Monstera",
                              species: "M. deliciosa"
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              },
              low_confidence: {
                summary: "Low confidence identification",
                description: "Example response when AI has lower confidence",
                value: {
                  access_token: "xyz789abc123",
                  status: "COMPLETED",
                  model_version: "1.0.0",
                  custom_id: null,
                  input: {
                    latitude: null,
                    longitude: null,
                    similar_images: false,
                    classification_level: "species",
                    language: "en"
                  },
                  result: {
                    is_plant: {
                      probability: 0.87,
                      binary: true,
                      threshold: 0.5
                    },
                    classification: {
                      suggestions: [
                        {
                          id: "unknown_fern",
                          name: "Unknown Fern Species",
                          probability: 0.34,
                          confirmed: false,
                          similar_images: [],
                          details: {
                            common_names: ["Fern"],
                            taxonomy: {
                              kingdom: "Plantae",
                              phylum: "Pteridophyta",
                              class: "Polypodiopsida",
                              order: "Polypodiales",
                              family: "Unknown",
                              genus: "Unknown",
                              species: "Unknown"
                            }
                          }
                        }
                      ]
                    }
                  }
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
        // Continue to handler
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
        custom_id: request.custom_id || undefined,
        input: {
          latitude: request.latitude || null,
          longitude: request.longitude || null,
          similar_images: request.similar_images || false,
          classification_level: request.classification_level || "species",
          language: request.language || "en"
        },
        result: {
          ...identificationResult,
          classification: {
            ...identificationResult.classification,
            suggestions: identificationResult.classification.suggestions.map(suggestion => ({
              ...suggestion,
              confirmed: suggestion.confirmed ?? false // Ensure confirmed field is always present
            }))
          }
        }
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
      await storeIdentificationRequest(c.env.DB, apiKeyInfo.id as number, requestForStorage, response);

      return c.json(response, 200);

    } catch (error) {
      console.error("Plant identification error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
}
