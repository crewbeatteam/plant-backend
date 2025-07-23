import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { HealthAssessmentFormDataSchema, HealthAssessmentResponseSchema } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { validateFileArray } from "../../utils/fileValidation";
import { createImageStorage } from "../../services/imageStorage";
import { generateHealthAssessment, storeHealthAssessment } from "../../services/healthAssessment";

// Helper function to parse FormData (reused from identification endpoint)
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
        data[key] = value;
      }
    }
  }
  
  data.images = images;
  return data;
}

// Helper function to upload images to R2 (reused from identification endpoint)
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

export class PlantHealthAssessment extends OpenAPIRoute {
  schema = {
    tags: ["Plant Health"],
    summary: "Assess plant health and detect diseases",
    description: `
Analyze plant images for health issues, diseases, and care recommendations. This endpoint detects common plant problems like pests, diseases, nutrient deficiencies, and environmental stress.

## Best Practices

### Image Guidelines
- **Focus on problem areas**: Capture close-ups of affected leaves, stems, or flowers
- **Multiple angles**: Include overall plant structure and detailed problem shots
- **Lighting**: Use natural light or bright indoor lighting
- **Background**: Plain backgrounds help AI focus on the plant

### Common Detectable Issues
- **Diseases**: Fungal infections, bacterial spots, viral symptoms
- **Pests**: Aphids, spider mites, scale insects, thrips
- **Deficiencies**: Nitrogen, phosphorus, potassium, micronutrients
- **Environmental**: Overwatering, underwatering, light stress, temperature damage

## Response Details
Results include confidence scores, treatment recommendations, and preventive care tips.
    `.trim(),
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: HealthAssessmentFormDataSchema,
            examples: {
              basic_assessment: {
                summary: "Basic health assessment",
                description: "Simple health check with plant images",
                value: {
                  images: ["[binary image data]"],
                  language: "en"
                }
              },
              detailed_assessment: {
                summary: "Detailed assessment with custom ID",
                description: "Complete health assessment request",
                value: {
                  images: ["[binary image data]", "[binary image data]"],
                  language: "en",
                  custom_id: "plant_health_check_001"
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
        description: "Health assessment completed successfully",
        content: {
          "application/json": {
            schema: HealthAssessmentResponseSchema,
            examples: {
              healthy_plant: {
                summary: "Healthy plant assessment",
                description: "Example response for a healthy plant with no issues detected",
                value: {
                  access_token: "health_abc123",
                  status: "COMPLETED",
                  model_version: "1.0.0",
                  custom_id: "plant_health_check_001",
                  input: {
                    language: "en"
                  },
                  result: {
                    is_healthy: {
                      probability: 0.92,
                      binary: true,
                      threshold: 0.5
                    },
                    disease: {
                      suggestions: []
                    },
                    health_assessment: {
                      overall_health_score: 9.2,
                      recommendations: [
                        "Continue current care routine",
                        "Monitor for any changes in leaf color",
                        "Ensure consistent watering schedule"
                      ]
                    }
                  }
                }
              },
              diseased_plant: {
                summary: "Plant with disease detected",
                description: "Example response when plant disease is detected",
                value: {
                  access_token: "health_xyz789",
                  status: "COMPLETED",
                  model_version: "1.0.0",
                  custom_id: null,
                  input: {
                    language: "en"
                  },
                  result: {
                    is_healthy: {
                      probability: 0.23,
                      binary: false,
                      threshold: 0.5
                    },
                    disease: {
                      suggestions: [
                        {
                          id: "powdery_mildew",
                          name: "Powdery Mildew",
                          probability: 0.84,
                          similar_images: [
                            {
                              id: "ref_001",
                              url: "https://example.com/powdery_mildew_ref.jpg",
                              similarity: 0.87
                            }
                          ],
                          details: {
                            common_names: ["White Mold", "Powdery Mildew"],
                            description: "Fungal infection causing white powdery spots on leaves",
                            treatment: {
                              immediate: [
                                "Remove affected leaves immediately",
                                "Improve air circulation around plant",
                                "Apply fungicidal spray"
                              ],
                              preventive: [
                                "Avoid overhead watering",
                                "Maintain proper spacing between plants",
                                "Ensure good ventilation"
                              ]
                            }
                          }
                        }
                      ]
                    },
                    health_assessment: {
                      overall_health_score: 3.4,
                      recommendations: [
                        "Treat fungal infection immediately",
                        "Isolate plant from other plants",
                        "Monitor closely for spread",
                        "Adjust watering and humidity levels"
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
      const validation = HealthAssessmentFormDataSchema.safeParse(parsedData);
      
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

      // Create request with R2 image data
      const assessmentRequest = {
        ...request,
        imageUrls,
        files
      };

      // Generate health assessment
      const response = await generateHealthAssessment(assessmentRequest, requestId);

      // Store the request and response in database
      const requestForStorage = {
        ...request,
        imageKeys,
        imageUrls,
        imageMetadata,
        primaryImageKey: imageKeys[0] || null,
        primaryImageUrl: imageUrls[0] || null
      };
      await storeHealthAssessment(c.env.DB, apiKeyInfo.id as number, requestForStorage, response);

      return c.json(response, 200);

    } catch (error) {
      console.error("Health assessment error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
}