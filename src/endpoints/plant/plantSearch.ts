import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { MOCK_PLANT_SPECIES } from "../../services/plantIdentification";

const PlantSearchResponseSchema = z.object({
  entities: z.array(z.object({
    matched_in: z.string(),
    matched_in_type: z.enum(["entity_name", "synonym", "common_name"]),
    access_token: z.string(),
    match_position: z.number(),
    match_length: z.number(),
    entity_name: z.string(),
    thumbnail: z.string().optional(),
  })),
  entities_trimmed: z.boolean(),
  limit: z.number(),
});

export class PlantSearch extends OpenAPIRoute {
  schema = {
    tags: ["Plant Knowledge Base"],
    summary: "Search plant knowledge base",
    description: "Search plants by scientific names, common names, or synonyms. This endpoint is in beta testing.",
    request: {
      query: z.object({
        q: z.string().min(1).describe("Search query for plant names"),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 10).pipe(z.number().min(1).max(20)).describe("Maximum results (1-20, default 10)"),
        language: z.string().default("en").describe("Language code for common names (ISO 639-1)"),
        thumbnails: z.string().optional().transform(val => val === "true").describe("Include 64x64 base64 thumbnails"),
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
        return null;
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

      // Search in mock plant data
      const results = this.searchPlants(query, limit, thumbnails);

      return c.json({
        entities: results,
        entities_trimmed: results.length >= limit,
        limit: limit,
      });

    } catch (error) {
      console.error("Plant search error:", error);
      return c.json({ error: "Search failed" }, 500);
    }
  }

  private searchPlants(query: string, limit: number, includeThumbnails: boolean) {
    const queryLower = query.toLowerCase();
    const results: any[] = [];

    for (const plant of MOCK_PLANT_SPECIES) {
      // Search in scientific name
      const scientificMatch = plant.name.toLowerCase().indexOf(queryLower);
      if (scientificMatch !== -1) {
        results.push({
          matched_in: plant.name,
          matched_in_type: "entity_name",
          access_token: this.generateAccessToken(plant.id),
          match_position: scientificMatch,
          match_length: query.length,
          entity_name: plant.name,
          ...(includeThumbnails && { thumbnail: this.generateThumbnail() }),
        });
      }

      // Search in common names
      for (const commonName of plant.common_names) {
        const commonMatch = commonName.toLowerCase().indexOf(queryLower);
        if (commonMatch !== -1) {
          results.push({
            matched_in: commonName,
            matched_in_type: "common_name",
            access_token: this.generateAccessToken(plant.id),
            match_position: commonMatch,
            match_length: query.length,
            entity_name: plant.name,
            ...(includeThumbnails && { thumbnail: this.generateThumbnail() }),
          });
        }
      }

      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }

  private generateAccessToken(plantId: number): string {
    // Generate a mock access token (in real implementation, this would be a proper token)
    return Buffer.from(`plant_${plantId}_${Date.now()}`).toString('base64').slice(0, 32);
  }

  private generateThumbnail(): string {
    // Return a minimal 1x1 pixel base64 image as mock thumbnail
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  }
}