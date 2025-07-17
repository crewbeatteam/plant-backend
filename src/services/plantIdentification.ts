import type { PlantIdentificationRequest, PlantIdentificationResponse, PlantSuggestion } from "../types";

// Mock plant species data
export const MOCK_PLANT_SPECIES = [
  {
    id: 1,
    name: "Ficus lyrata",
    common_names: ["Fiddle Leaf Fig", "Fiddle-leaf Fig Tree"],
    genus: "Ficus",
    species: "lyrata",
    gbif_id: 2984084,
    inaturalist_id: 135264,
    wikipedia: {
      title: "Ficus lyrata",
      url: "https://en.wikipedia.org/wiki/Ficus_lyrata",
      image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Ficus_lyrata_1.jpg/256px-Ficus_lyrata_1.jpg"
    },
    taxonomy: {
      kingdom: "Plantae",
      phylum: "Tracheophyta",
      class: "Magnoliopsida",
      order: "Rosales",
      family: "Moraceae",
      genus: "Ficus",
      species: "Ficus lyrata"
    }
  },
  {
    id: 2,
    name: "Monstera deliciosa",
    common_names: ["Swiss Cheese Plant", "Split-leaf Philodendron", "Mexican Breadfruit"],
    genus: "Monstera",
    species: "deliciosa",
    gbif_id: 2768353,
    inaturalist_id: 129623,
    wikipedia: {
      title: "Monstera deliciosa",
      url: "https://en.wikipedia.org/wiki/Monstera_deliciosa",
      image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Monstera_deliciosa3.jpg/256px-Monstera_deliciosa3.jpg"
    },
    taxonomy: {
      kingdom: "Plantae",
      phylum: "Tracheophyta",
      class: "Liliopsida",
      order: "Alismatales",
      family: "Araceae",
      genus: "Monstera",
      species: "Monstera deliciosa"
    }
  },
  {
    id: 3,
    name: "Sansevieria trifasciata",
    common_names: ["Snake Plant", "Mother-in-law's Tongue", "Saint George's Sword"],
    genus: "Sansevieria",
    species: "trifasciata",
    gbif_id: 2757059,
    inaturalist_id: 78301,
    wikipedia: {
      title: "Sansevieria trifasciata",
      url: "https://en.wikipedia.org/wiki/Sansevieria_trifasciata",
      image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Sansevieria_trifasciata_1.jpg/256px-Sansevieria_trifasciata_1.jpg"
    },
    taxonomy: {
      kingdom: "Plantae",
      phylum: "Tracheophyta",
      class: "Liliopsida",
      order: "Asparagales",
      family: "Asparagaceae",
      genus: "Sansevieria",
      species: "Sansevieria trifasciata"
    }
  },
  {
    id: 4,
    name: "Epipremnum aureum",
    common_names: ["Golden Pothos", "Devil's Ivy", "Money Plant"],
    genus: "Epipremnum",
    species: "aureum",
    gbif_id: 2893049,
    inaturalist_id: 129804,
    wikipedia: {
      title: "Epipremnum aureum",
      url: "https://en.wikipedia.org/wiki/Epipremnum_aureum",
      image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Epipremnum_aureum_31082016.jpg/256px-Epipremnum_aureum_31082016.jpg"
    },
    taxonomy: {
      kingdom: "Plantae",
      phylum: "Tracheophyta",
      class: "Liliopsida",
      order: "Alismatales",
      family: "Araceae",
      genus: "Epipremnum",
      species: "Epipremnum aureum"
    }
  }
];

export async function generatePlantIdentification(
  request: PlantIdentificationRequest,
  requestId: number
): Promise<PlantIdentificationResponse> {
  // Simulate processing time
  const processingStart = new Date().toISOString();
  
  // Mock ML prediction logic - in reality this would call an ML service
  const randomSpecies = MOCK_PLANT_SPECIES[Math.floor(Math.random() * MOCK_PLANT_SPECIES.length)];
  const secondChoice = MOCK_PLANT_SPECIES.find(s => s.id !== randomSpecies.id) || MOCK_PLANT_SPECIES[0];
  
  // Parse requested details
  const requestedDetails = request.details?.split(",").map(d => d.trim()) || [];
  
  // Build plant suggestions with requested details
  const suggestions: PlantSuggestion[] = [
    {
      id: randomSpecies.id,
      name: randomSpecies.name,
      probability: 0.85 + Math.random() * 0.1, // 85-95%
      confirmed: false,
      similar_images: request.similar_images ? generateSimilarImages() : undefined,
      details: buildPlantDetails(randomSpecies, requestedDetails)
    },
    {
      id: secondChoice.id,
      name: secondChoice.name,
      probability: 0.05 + Math.random() * 0.15, // 5-20%
      confirmed: false,
      similar_images: request.similar_images ? generateSimilarImages() : undefined,
      details: buildPlantDetails(secondChoice, requestedDetails)
    }
  ];
  
  // Simulate processing completion time
  const processingEnd = new Date().toISOString();
  
  // Generate access token
  const accessToken = generateAccessToken(requestId);
  
  return {
    access_token: accessToken,
    custom_id: request.custom_id,
    result: {
      is_plant: {
        probability: 0.95 + Math.random() * 0.05, // 95-100%
        threshold: 0.5,
        binary: true
      },
      classification: {
        suggestions: suggestions.sort((a, b) => b.probability - a.probability)
      }
    },
    status: "COMPLETED",
    sla_compliant_client: true,
    sla_compliant_system: true,
    created: processingStart,
    completed: processingEnd
  };
}

function buildPlantDetails(species: typeof MOCK_PLANT_SPECIES[0], requestedDetails: string[]) {
  const details: any = {};
  
  if (requestedDetails.includes("common_names")) {
    details.common_names = species.common_names;
  }
  
  if (requestedDetails.includes("url") && species.wikipedia) {
    details.url = species.wikipedia.url;
  }
  
  if (requestedDetails.includes("gbif_id")) {
    details.gbif_id = species.gbif_id;
  }
  
  if (requestedDetails.includes("inaturalist_id")) {
    details.inaturalist_id = species.inaturalist_id;
  }
  
  if (requestedDetails.includes("wikipedia")) {
    details.wikipedia = species.wikipedia;
  }
  
  if (requestedDetails.includes("taxonomy")) {
    details.taxonomy = species.taxonomy;
  }
  
  return Object.keys(details).length > 0 ? details : undefined;
}

function generateSimilarImages() {
  return [
    {
      id: "img_" + Math.random().toString(36).slice(2),
      url: "https://plant-id.ams3.digitaloceanspaces.com/similar_images/1/1.jpg",
      license_name: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      citation: "Plant.id - Plant Identification",
    },
    {
      id: "img_" + Math.random().toString(36).slice(2),
      url: "https://plant-id.ams3.digitaloceanspaces.com/similar_images/1/2.jpg",
      license_name: "CC BY 2.0",
      license_url: "https://creativecommons.org/licenses/by/2.0/",
      citation: "Plant.id - Plant Identification",
    }
  ];
}

function generateAccessToken(requestId: number): string {
  // Generate a token similar to Plant.ID's format
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + "=" + requestId; // Include request ID for reference
}

export async function storeIdentificationRequest(
  db: D1Database,
  apiKeyId: number,
  request: any, // Extended to include R2 image data
  response: PlantIdentificationResponse
): Promise<void> {
  // Extract numeric ID from access token
  let numericId: number;
  if (response.access_token.includes('=')) {
    // Format: "token=123" (from generateAccessToken)
    numericId = parseInt(response.access_token.split('=')[1]);
  } else {
    // Format: "123" (direct requestId)
    numericId = parseInt(response.access_token);
  }
  
  // Validate numericId
  if (isNaN(numericId)) {
    throw new Error(`Invalid access token format: ${response.access_token}`);
  }
  
  // Insert main identification record with R2 image data (no more base64)
  await db.prepare(`
    INSERT INTO plant_identifications 
    (id, api_key_id, image_key, image_url, thumbnail_url, is_plant, classification_level, details, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    numericId,
    apiKeyId,
    request.primaryImageKey || null,
    request.primaryImageUrl || null,
    null, // thumbnail_url - to be implemented later
    response.result.is_plant.probability,
    request.classification_level,
    request.details || null,
    JSON.stringify(response)
  ).run();

  // Store image metadata and relationships if R2 data is available
  if (request.imageKeys && request.imageUrls && request.imageMetadata) {
    for (let i = 0; i < request.imageKeys.length; i++) {
      const imageKey = request.imageKeys[i];
      const imageUrl = request.imageUrls[i];
      const metadata = request.imageMetadata[i];
      const isPrimary = i === 0;

      // Insert or update image metadata
      await db.prepare(`
        INSERT OR REPLACE INTO image_metadata 
        (image_key, image_url, content_hash, content_type, file_size, original_filename, uploaded_at, access_count, last_accessed)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(
        imageKey,
        imageUrl,
        metadata.contentHash,
        metadata.contentType,
        metadata.fileSize,
        metadata.originalFilename,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();

      // Link image to identification
      await db.prepare(`
        INSERT INTO identification_images 
        (identification_id, image_key, image_order, is_primary)
        VALUES (?, ?, ?, ?)
      `).bind(
        numericId,
        imageKey,
        i,
        isPrimary
      ).run();
    }
  }
}