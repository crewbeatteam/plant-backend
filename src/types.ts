import type { Context } from "hono";
import { z } from "zod";

export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  PLANTNET_API_KEY: string;
  OPENAI_API_KEY: string;
  PERENUAL_API_KEY: string;
  DEFAULT_IDENTIFIER: string;
  FALLBACK_IDENTIFIERS: string;
  DEFAULT_PLANT_SEARCH_PROVIDER: string;
  PLANT_SEARCH_DEGRADATION_PROVIDERS: string;
}

export type AppContext = Context<{ 
  Bindings: Env,
  Variables: {
    apiKey: {
      id: unknown;
      name: unknown;
      is_active: unknown;
    }
  }
}>;
export type HandleArgs = [AppContext];

// Plant.ID API Schema Definitions

// Common detail options that can be requested
export const PlantDetailsSchema = z.object({
  url: z.string().optional(),
  common_names: z.array(z.string()).optional(),
  gbif_id: z.number().optional(),
  inaturalist_id: z.number().optional(),
  wikipedia: z.object({
    title: z.string(),
    url: z.string(),
    image: z.string().optional(),
  }).optional(),
  taxonomy: z.object({
    kingdom: z.string(),
    phylum: z.string(),
    class: z.string(),
    order: z.string(),
    family: z.string(),
    genus: z.string(),
    species: z.string(),
  }).optional(),
});

// Plant identification request schema (FormData)
export const PlantIdentificationFormDataSchema = z.object({
  images: z.array(z.custom<File>()).min(1, "At least one image is required").openapi({ 
    type: "array", 
    items: { type: "string", format: "binary" },
    description: "Array of image files to upload"
  }), // uploaded files
  details: z.string().optional(), // comma-separated list: "url,common_names,gbif_id"
  classification_level: z.enum(["all", "genus", "species", "infraspecies"]).default("species"),
  classification_raw: z.boolean().default(false),
  language: z.string().default("en"),
  latitude: z.number().optional(), // geographic coordinate
  longitude: z.number().optional(), // geographic coordinate
  similar_images: z.boolean().default(false), // include similar images
  custom_id: z.number().optional(), // unique identifier
  datetime: z.string().optional(), // ISO format date when images were taken
  health: z.enum(["only", "auto", "all"]).optional(), // health assessment mode
  suggestion_filter: z.object({
    classification: z.string(),
  }).optional().describe("JSON string in FormData: {\"classification\": \"value\"}"), // restrict output to specified classes
  symptoms: z.boolean().default(false), // return disease symptom heatmaps
});

// Plant species suggestion
export const PlantSuggestionSchema = z.object({
  id: z.number(),
  name: z.string(),
  scientific_name: z.string().optional(),
  probability: z.number().min(0).max(1),
  confirmed: z.boolean().optional().default(false),
  common_names: z.array(z.string()).optional(),
  similar_images: z.array(z.object({
    id: z.string(),
    url: z.string(),
    license_name: z.string().optional(),
    license_url: z.string().optional(),
    citation: z.string().optional(),
  })).optional(),
  details: z.union([
    PlantDetailsSchema,
    z.object({
      reasoning: z.string(),
    }),
    z.any()
  ]).optional(),
});

// Plant identification response schema
export const PlantIdentificationResponseSchema = z.object({
  access_token: z.string(),
  custom_id: z.union([z.number(), z.string()]).optional(),
  result: z.object({
    is_plant: z.object({
      probability: z.number().min(0).max(1),
      threshold: z.number().min(0).max(1),
      binary: z.boolean(),
    }),
    classification: z.object({
      suggestions: z.array(PlantSuggestionSchema),
    }),
  }),
  status: z.string(),
  sla_compliant_client: z.boolean().optional(),
  sla_compliant_system: z.boolean().optional(),
  created: z.string().optional(),
  completed: z.string().optional(),
  model_version: z.string().optional(),
  input: z.object({
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    similar_images: z.boolean().optional(),
    classification_level: z.string().optional(),
    language: z.string().optional(),
  }).optional(),
});

// Health assessment request schema (FormData)
export const HealthAssessmentFormDataSchema = z.object({
  images: z.array(z.custom<File>()).min(1, "At least one image is required").openapi({ 
    type: "array", 
    items: { type: "string", format: "binary" },
    description: "Array of image files to upload"
  }),
  details: z.string().optional(),
  language: z.string().default("en"),
  custom_id: z.union([z.number(), z.string()]).optional(),
});

// Disease suggestion
export const DiseaseSuggestionSchema = z.object({
  id: z.number(),
  name: z.string(),
  probability: z.number().min(0).max(1),
  redundant: z.boolean().optional(),
  similar_images: z.array(z.object({
    id: z.string(),
    url: z.string(),
    license_name: z.string().optional(),
    license_url: z.string().optional(),
    citation: z.string().optional(),
  })).optional(),
  details: z.object({
    local_name: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    treatment: z.object({
      biological: z.array(z.string()).optional(),
      chemical: z.array(z.string()).optional(),
      prevention: z.array(z.string()).optional(),
    }).optional(),
    classification: z.array(z.string()).optional(),
    common_names: z.array(z.string()).optional(),
    cause: z.string().optional(),
  }).optional(),
});

// Health assessment response schema
export const HealthAssessmentResponseSchema = z.object({
  access_token: z.string(),
  custom_id: z.union([z.number(), z.string()]).optional(),
  result: z.object({
    is_healthy: z.object({
      probability: z.number().min(0).max(1),
      threshold: z.number().min(0).max(1),
      binary: z.boolean(),
    }),
    disease: z.object({
      suggestions: z.array(DiseaseSuggestionSchema),
      question: z.object({
        text: z.string(),
        options: z.array(z.object({
          suggestion_index: z.number(),
          entity_id: z.number(),
          name: z.string(),
        })),
      }).optional(),
    }),
    health_assessment: z.object({
      overall_health_score: z.number(),
      recommendations: z.array(z.string()),
    }).optional(),
  }),
  status: z.string(),
  sla_compliant_client: z.boolean().optional(),
  sla_compliant_system: z.boolean().optional(),
  created: z.string().optional(),
  completed: z.string().optional(),
  model_version: z.string().optional(),
  input: z.object({
    language: z.string(),
  }).optional(),
});

// API Key schema for authentication
export const ApiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  key_hash: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  last_used_at: z.string().optional(),
});

// Database model schemas
export const PlantSpeciesSchema = z.object({
  id: z.number(),
  scientific_name: z.string(),
  common_names: z.string().optional(), // JSON string
  genus: z.string(),
  species: z.string(),
  infraspecies: z.string().optional(),
  gbif_id: z.number().optional(),
  inaturalist_id: z.number().optional(),
  wikipedia_url: z.string().optional(),
  created_at: z.string(),
});

export const PlantDiseaseSchema = z.object({
  id: z.number(),
  name: z.string(),
  scientific_name: z.string().optional(),
  description: z.string().optional(),
  treatment: z.string().optional(),
  severity_level: z.enum(["low", "medium", "high"]).optional(),
  created_at: z.string(),
});

// Type exports
export type PlantIdentificationRequest = z.infer<typeof PlantIdentificationFormDataSchema>;
export type PlantIdentificationResponse = z.infer<typeof PlantIdentificationResponseSchema>;
export type HealthAssessmentRequest = z.infer<typeof HealthAssessmentFormDataSchema>;
export type HealthAssessmentResponse = z.infer<typeof HealthAssessmentResponseSchema>;
export type PlantSuggestion = z.infer<typeof PlantSuggestionSchema>;
export type DiseaseSuggestion = z.infer<typeof DiseaseSuggestionSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type PlantSpecies = z.infer<typeof PlantSpeciesSchema>;
export type PlantDisease = z.infer<typeof PlantDiseaseSchema>;
