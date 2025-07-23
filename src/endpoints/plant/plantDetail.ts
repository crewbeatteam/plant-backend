import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { MOCK_PLANT_SPECIES } from "../../services/plantIdentification";

const PlantDetailResponseSchema = z.object({
  access_token: z.string(),
  entity_name: z.string(),
  details: z.record(z.any()),
});

export class PlantDetail extends OpenAPIRoute {
  schema = {
    tags: ["Plant Knowledge Base"],
    summary: "Get plant details",
    description: "Get detailed information about a plant using access token from search. Costs 0.5 credits per call.",
    request: {
      params: z.object({
        access_token: z.string().describe("Access token from plant search"),
      }),
      query: z.object({
        details: z.string().describe("Comma-separated list of requested details"),
        language: z.string().default("en").describe("Language code (ISO 639-1)"),
      }),
      headers: z.object({
        "Api-Key": z.string().describe("API key for authentication"),
      }),
    },
    responses: {
      "200": {
        description: "Plant details retrieved successfully",
        content: {
          "application/json": {
            schema: PlantDetailResponseSchema,
          },
        },
      },
      "400": {
        description: "Invalid parameters",
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
      "404": {
        description: "Plant not found",
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

      // Get parameters
      const accessToken = c.req.param("access_token");
      const detailsParam = c.req.query("details");
      const language = c.req.query("language") || "en";

      if (!accessToken) {
        return c.json({ error: "Access token is required" }, 400);
      }

      if (!detailsParam) {
        return c.json({ error: "Details parameter is required" }, 400);
      }

      // Parse access token to get plant ID
      const plantId = this.parseAccessToken(accessToken);
      if (!plantId) {
        return c.json({ error: "Invalid access token" }, 404);
      }

      // Find plant in mock data
      const plant = MOCK_PLANT_SPECIES.find(p => p.id === plantId);
      if (!plant) {
        return c.json({ error: "Plant not found" }, 404);
      }

      // Parse requested details
      const requestedDetails = detailsParam.split(",").map(d => d.trim());

      // Build response details
      const details = this.buildPlantDetails(plant, requestedDetails, language);

      return c.json({
        access_token: accessToken,
        entity_name: plant.name,
        details: details,
      });

    } catch (error) {
      console.error("Plant detail error:", error);
      return c.json({ error: "Failed to retrieve plant details" }, 500);
    }
  }

  private parseAccessToken(token: string): number | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const match = decoded.match(/plant_(\d+)_/);
      return match ? parseInt(match[1]) : null;
    } catch {
      return null;
    }
  }

  private buildPlantDetails(plant: typeof MOCK_PLANT_SPECIES[0], requestedDetails: string[], language: string) {
    const details: any = {};

    for (const detail of requestedDetails) {
      switch (detail) {
        case "common_names":
          details.common_names = plant.common_names;
          break;
        case "url":
          details.url = plant.wikipedia?.url || null;
          break;
        case "description":
          details.description = `${plant.name} is a popular houseplant known for its distinctive appearance and ease of care.`;
          break;
        case "description_gpt":
          details.description_gpt = `${plant.name} is a beautiful plant that makes an excellent addition to any indoor garden.`;
          break;
        case "taxonomy":
          details.taxonomy = plant.taxonomy;
          break;
        case "rank":
          details.rank = "species";
          break;
        case "gbif_id":
          details.gbif_id = plant.gbif_id;
          break;
        case "inaturalist_id":
          details.inaturalist_id = plant.inaturalist_id;
          break;
        case "image":
          details.image = plant.wikipedia?.image || null;
          break;
        case "images":
          details.images = plant.wikipedia?.image ? [plant.wikipedia.image] : [];
          break;
        case "synonyms":
          details.synonyms = [];
          break;
        case "edible_parts":
          details.edible_parts = [];
          break;
        case "propagation_methods":
          details.propagation_methods = ["cuttings", "division"];
          break;
        case "watering":
          details.watering = {
            min: 1,
            max: 3,
          };
          break;
        case "best_watering":
          details.best_watering = "Water when the top inch of soil feels dry. Avoid overwatering.";
          break;
        case "best_light_condition":
          details.best_light_condition = "Bright, indirect light works best. Avoid direct sunlight.";
          break;
        case "best_soil_type":
          details.best_soil_type = "Well-draining potting mix with good aeration.";
          break;
        case "common_uses":
          details.common_uses = "Popular as an indoor decorative plant and air purifier.";
          break;
        case "toxicity":
          details.toxicity = "Generally non-toxic to humans and pets, but always verify before consumption.";
          break;
        case "cultural_significance":
          details.cultural_significance = "Widely appreciated in modern indoor gardening and plant collecting communities.";
          break;
        default:
          // Unknown detail, return null
          details[detail] = null;
      }
    }

    return details;
  }
}