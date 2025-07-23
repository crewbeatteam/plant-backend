import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { PlantSearchFactory } from "../../services/plantSearch";

const PlantSearchResponseSchema = z.object({
  entities: z.array(z.object({
    matched_in: z.string(),
    matched_in_type: z.enum(["entity_name", "synonym", "common_name"]),
    access_token: z.string(),
    match_position: z.number(),
    match_length: z.number(),
    entity_name: z.string(),
    common_names: z.array(z.string()).optional(),
    synonyms: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
    confidence: z.number().optional(),
    provider_source: z.string(),
    provider_id: z.string().optional(),
  })),
  entities_trimmed: z.boolean(),
  limit: z.number(),
  provider: z.string(),
  cached: z.boolean(),
  search_time_ms: z.number(),
  query_normalized: z.string(),
  total_found: z.number().optional(),
});

export class PlantSearch extends OpenAPIRoute {
  schema = {
    tags: ["Plant Knowledge Base"],
    summary: "Search plant knowledge base",
    description: `
Search the comprehensive plant database by scientific names, common names, or synonyms. This endpoint helps you find plants and get access tokens for detailed information.

## Search Features

### Search Types
- **Scientific names**: Search by binomial nomenclature (e.g., "Monstera deliciosa")
- **Common names**: Search by popular names (e.g., "Swiss cheese plant")
- **Partial matches**: Find plants with partial name matches
- **Synonyms**: Historical and alternative scientific names

### Search Tips
- Use specific terms for better results
- Try both scientific and common names
- Use partial words to find broader matches
- Check different languages for regional names

### Beta Features
- Advanced filtering by plant characteristics
- Location-based search results
- Seasonal availability information

**Note**: This endpoint is currently in beta testing. Some features may change in future versions.
    `.trim(),
    request: {
      query: z.object({
        q: z.string().min(1).describe("Search query for plant names"),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 10).pipe(z.number().min(1).max(100)).describe("Maximum results (1-100, default 10)"),
        language: z.string().default("en").describe("Language code for common names (ISO 639-1)"), 
        thumbnails: z.string().optional().transform(val => val === "true").describe("Include thumbnails in results"),
        // New filter parameters
        indoor: z.string().optional().transform(val => val === "true").describe("Filter for indoor plants"),
        outdoor: z.string().optional().transform(val => val === "true").describe("Filter for outdoor plants"),
        edible: z.string().optional().transform(val => val === "true").describe("Filter for edible plants"),
        poisonous: z.string().optional().transform(val => val === "true").describe("Filter for poisonous plants"),
        difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Care difficulty level"),
        care_level: z.enum(["low", "medium", "high"]).optional().describe("Care level required"),
        sunlight: z.enum(["low", "medium", "high", "full"]).optional().describe("Sunlight requirements"),
        watering: z.enum(["low", "medium", "high"]).optional().describe("Watering requirements"),
        cycle: z.enum(["annual", "biennial", "perennial"]).optional().describe("Plant life cycle"),
      }),
      headers: z.object({
        "Api-Key": z.string().describe("API key for authentication"),
      }),
    },
    responses: {
      "200": {
        description: "Search results",
        content: {
          "application/json": {
            schema: PlantSearchResponseSchema,
            examples: {
              successful_search: {
                summary: "Successful plant search",
                description: "Example response with multiple matching plants",
                value: {
                  entities: [
                    {
                      matched_in: "Monstera deliciosa",
                      matched_in_type: "entity_name",
                      access_token: "cGxhbnRfMV8xNzI5NzY4ODIw",
                      match_position: 0,
                      match_length: 8,
                      entity_name: "Monstera deliciosa",
                      thumbnail: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                    },
                    {
                      matched_in: "Swiss Cheese Plant",
                      matched_in_type: "common_name",
                      access_token: "cGxhbnRfMV8xNzI5NzY4ODIx",
                      match_position: 6,
                      match_length: 8,
                      entity_name: "Monstera deliciosa"
                    }
                  ],
                  entities_trimmed: false,
                  limit: 10
                }
              },
              no_results: {
                summary: "No search results",
                description: "Example response when no plants match the search query",
                value: {
                  entities: [],
                  entities_trimmed: false,
                  limit: 10
                }
              },
              limited_results: {
                summary: "Limited search results",
                description: "Example response when results are trimmed due to limit",
                value: {
                  entities: [
                    {
                      matched_in: "Fern",
                      matched_in_type: "common_name",
                      access_token: "cGxhbnRfM18xNzI5NzY4ODMw",
                      match_position: 0,
                      match_length: 4,
                      entity_name: "Pteridium aquilinum"
                    },
                    {
                      matched_in: "Boston Fern",
                      matched_in_type: "common_name",
                      access_token: "cGxhbnRfNF8xNzI5NzY4ODMx",
                      match_position: 7,
                      match_length: 4,
                      entity_name: "Nephrolepis exaltata"
                    }
                  ],
                  entities_trimmed: true,
                  limit: 2
                }
              }
            }
          },
        },
      },
      "400": {
        description: "Invalid search parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
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
    },
  };

  async handle(c: AppContext) {
    try {
      // Apply authentication middleware
      const authResponse = await apiKeyAuth(c, async () => {
        // Continue to handler
      });
      
      if (authResponse) {
        return authResponse;
      }

      const apiKeyInfo = c.get("apiKey");
      if (!apiKeyInfo) {
        return c.json({ error: "Authentication failed" }, 401);
      }

      // Parse query parameters
      const query = c.req.query("q");
      const limit = parseInt(c.req.query("limit") || "10");
      const language = c.req.query("language") || "en";
      const thumbnails = c.req.query("thumbnails") === "true";

      if (!query) {
        return c.json({ error: "Query parameter 'q' is required" }, 400);
      }

      // Parse filter parameters
      const filters: any = {};
      if (c.req.query("indoor") !== undefined) filters.indoor = c.req.query("indoor") === "true";
      if (c.req.query("outdoor") !== undefined) filters.outdoor = c.req.query("outdoor") === "true";
      if (c.req.query("edible") !== undefined) filters.edible = c.req.query("edible") === "true";
      if (c.req.query("poisonous") !== undefined) filters.poisonous = c.req.query("poisonous") === "true";
      if (c.req.query("difficulty")) filters.difficulty = c.req.query("difficulty");
      if (c.req.query("care_level")) filters.care_level = c.req.query("care_level");
      if (c.req.query("sunlight")) filters.sunlight = c.req.query("sunlight");
      if (c.req.query("watering")) filters.watering = c.req.query("watering");
      if (c.req.query("cycle")) filters.cycle = c.req.query("cycle");

      // Create plant search factory from environment
      console.log("=== PLANT SEARCH DEBUG ===");
      console.log("Environment variables:", {
        DEFAULT_PLANT_SEARCH_PROVIDER: c.env.DEFAULT_PLANT_SEARCH_PROVIDER,
        PLANT_SEARCH_DEGRADATION_PROVIDERS: c.env.PLANT_SEARCH_DEGRADATION_PROVIDERS,
        PERENUAL_API_KEY: c.env.PERENUAL_API_KEY ? "***SET***" : "NOT SET"
      });
      
      const factory = PlantSearchFactory.fromEnvironment(c.env, c.env.DB);
      
      // Validate factory configuration
      const configValidation = factory.validateConfig();
      console.log("Factory configuration validation:", configValidation);
      
      // Prepare search request
      const searchRequest = {
        query: query,
        limit: limit,
        language: language,
        filters: Object.keys(filters).length > 0 ? filters : undefined
      };
      
      console.log("Search request:", searchRequest);

      // Perform search using provider factory
      console.log("Starting plant search with factory...");
      const searchResult = await factory.search(searchRequest);
      console.log("Search completed, result:", {
        provider: searchResult.provider,
        entities_count: searchResult.entities.length,
        search_time: searchResult.search_time_ms
      });
      
      // Add thumbnails if requested (backward compatibility)
      if (thumbnails) {
        for (const entity of searchResult.entities) {
          if (!entity.thumbnail) {
            entity.thumbnail = this.generateThumbnail();
          }
        }
      }

      console.log("=== FINAL PLANT SEARCH RESPONSE ===");
      console.log(JSON.stringify(searchResult, null, 2));
      
      return c.json(searchResult);

    } catch (error) {
      console.error("Plant search error:", error);
      return c.json({ error: "Search failed" }, 500);
    }
  }


  private generateThumbnail(): string {
    // Return a minimal 1x1 pixel base64 image as mock thumbnail
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  }
}