import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";
import { PlantSearchFactory } from "../../services/plantSearch";

const PlantDetailResponseSchema = z.object({
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
  details: z.object({
    taxonomy: z.object({
      kingdom: z.string(),
      phylum: z.string(),
      class: z.string(),
      order: z.string(),
      family: z.string(),
      genus: z.string(),
      species: z.string(),
    }).optional(),
    characteristics: z.object({
      indoor: z.boolean().optional(),
      outdoor: z.boolean().optional(),
      edible: z.boolean().optional(),
      poisonous: z.boolean().optional(),
      difficulty: z.string().optional(),
      care_level: z.string().optional(),
      sunlight: z.string().optional(),
      watering: z.string().optional(),
      cycle: z.string().optional(),
      mature_height: z.string().optional(), 
      mature_width: z.string().optional(),
      rank: z.string().optional(),
      rank_level: z.number().optional(),
      is_active: z.boolean().optional(),
      taxonomic_status: z.string().optional(),
      nomenclatural_status: z.string().optional(),
      authorship: z.string().optional(),
      canonical_name: z.string().optional(),
      name_type: z.string().optional(),
      origin: z.string().optional(),
      num_descendants: z.number().optional(),
      iconic_taxon_id: z.number().optional(),
      complete_species_count: z.number().optional(),
      atlas_id: z.number().optional(),
    }).optional(),
    observations_count: z.number().optional(),
    external_ids: z.object({
      gbif_id: z.number().optional(),
      inaturalist_id: z.number().optional(),
      perenual_id: z.number().optional(),
      nub_key: z.number().optional(),
      name_key: z.number().optional(),
      accepted_key: z.number().optional(),
      parent_key: z.number().optional(),
      dataset_key: z.string().optional(),
      parent_id: z.number().optional(),
    }).optional(),
    conservation: z.object({
      status: z.any().optional(),
      statuses: z.array(z.any()).optional(),
    }).optional(),
    ancestry: z.object({
      ancestor_ids: z.array(z.number()).optional(),
      ancestors: z.array(z.any()).optional(),
      parent: z.any().optional(),
      children_count: z.number().optional(),
    }).optional(),
    images: z.array(z.object({
      url: z.string(),
      thumbnail: z.string().optional(),
      license: z.string().optional(),
      attribution: z.string().optional(),
    })).optional(),
    wikipedia: z.object({
      title: z.string(),
      url: z.string(),
      extract: z.string().optional(),
    }).optional(),
  }).optional(),
});

export class PlantDetail extends OpenAPIRoute {
  schema = {
    tags: ["Plant Knowledge Base"],
    summary: "Get plant details",
    description: `
Get comprehensive information about a specific plant using an access token from plant search results.

## How it works
1. First search for plants using \`/v3/kb/plants/name_search\`
2. Get the \`access_token\` from search results
3. Use this endpoint to retrieve detailed information

## Data Sources
The system uses multiple biodiversity databases with graceful degradation:
- **GBIF (Primary)**: Scientific taxonomy, vernacular names, synonyms, nomenclatural status
- **iNaturalist**: Community photos, observations, conservation status, ancestry data
- **Perenual**: Care guides, plant characteristics, growing information
- **Local Database**: Cached comprehensive data from all providers
- **Mock**: Fallback plant database

## Comprehensive Response Data
Returns extensive plant information including:

### **Taxonomic Information**
- Complete taxonomic hierarchy (kingdom → species)
- Scientific nomenclature details (authorship, canonical names)
- Taxonomic and nomenclatural status
- All vernacular names and synonyms

### **Biological Data**
- Observation counts and community engagement metrics
- Conservation status and assessments
- Ancestry data and phylogenetic relationships
- External database cross-references (GBIF, iNaturalist, Perenual)

### **Care & Characteristics**
- Growing requirements (sunlight, watering, care level)
- Plant characteristics (indoor/outdoor, edible, difficulty)
- Physical descriptions (mature size, growth cycle)
- Environmental preferences

### **Rich Media**
- High-quality images with proper attribution
- Wikipedia links with contextual information
- Community photos from iNaturalist observations

### **Provider-Specific Data**
- **GBIF**: Taxonomic authority, nomenclatural standards
- **iNaturalist**: Community observations, real-world photos
- **Perenual**: Practical care information and growing guides

**Note**: Access tokens are temporary and tied to specific search sessions.
    `.trim(),
    request: {
      params: z.object({
        access_token: z.string().describe("Access token from plant search results"),
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

      // Get access token from URL parameters
      const accessToken = c.req.param("access_token");

      if (!accessToken) {
        return c.json({ error: "Access token is required" }, 400);
      }

      console.log("=== PLANT DETAIL RETRIEVAL START ===");
      console.log("Access token:", accessToken);

      // Create plant search factory from environment
      const factory = PlantSearchFactory.fromEnvironment(c.env, c.env.DB);
      
      // Get detailed plant information using the new multi-provider system
      console.log("Retrieving plant details using factory...");
      const plantDetails = await factory.getDetails(accessToken);
      
      if (!plantDetails) {
        console.log("Plant not found or access token invalid");
        return c.json({ error: "Plant not found or invalid access token" }, 404);
      }

      console.log("Plant details retrieved successfully:", {
        entity_name: plantDetails.entity_name,
        provider_source: plantDetails.provider_source,
        has_details: !!plantDetails.details
      });

      console.log("=== PLANT DETAIL RESPONSE ===");
      console.log(JSON.stringify(plantDetails, null, 2));

      return c.json(plantDetails);

    } catch (error) {
      console.error("Plant detail error:", error);
      return c.json({ error: "Failed to retrieve plant details" }, 500);
    }
  }

}