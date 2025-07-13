import type { HealthAssessmentRequest, HealthAssessmentResponse, DiseaseSuggestion } from "../types";

// Mock disease data
export const MOCK_DISEASES = [
  {
    id: 1,
    name: "Leaf Spot",
    description: "Brown or black spots on leaves, often caused by fungal or bacterial infections",
    treatment: {
      biological: ["Neem oil spray", "Baking soda solution"],
      chemical: ["Copper fungicide", "Chlorothalonil"],
      prevention: ["Avoid overhead watering", "Improve air circulation", "Remove affected leaves"]
    },
    url: "https://extension.umn.edu/plant-diseases/leaf-spots"
  },
  {
    id: 2,
    name: "Powdery Mildew",
    description: "White, powdery fungal growth on leaves and stems",
    treatment: {
      biological: ["Milk spray (1:10 ratio)", "Potassium bicarbonate"],
      chemical: ["Sulfur-based fungicides", "Myclobutanil"],
      prevention: ["Ensure good air circulation", "Avoid overcrowding", "Water at soil level"]
    },
    url: "https://extension.umn.edu/plant-diseases/powdery-mildew"
  },
  {
    id: 3,
    name: "Root Rot",
    description: "Decay of root system, often caused by overwatering and poor drainage",
    treatment: {
      biological: ["Reduce watering", "Repot with fresh soil", "Trim affected roots"],
      chemical: ["Hydrogen peroxide soil drench", "Fungicidal soil treatment"],
      prevention: ["Proper drainage", "Well-draining soil", "Allow soil to dry between waterings"]
    },
    url: "https://extension.umn.edu/plant-diseases/root-rot"
  },
  {
    id: 4,
    name: "Aphid Infestation",
    description: "Small, soft-bodied insects that feed on plant juices",
    treatment: {
      biological: ["Insecticidal soap", "Ladybugs release", "Neem oil"],
      chemical: ["Imidacloprid", "Malathion"],
      prevention: ["Regular inspection", "Companion planting", "Remove weeds"]
    },
    url: "https://extension.umn.edu/yard-and-garden-insects/aphids"
  },
  {
    id: 5,
    name: "Spider Mites",
    description: "Tiny arachnids that cause stippling and webbing on leaves",
    treatment: {
      biological: ["Predatory mites", "Insecticidal soap", "Increase humidity"],
      chemical: ["Abamectin", "Bifenthrin"],
      prevention: ["Maintain humidity", "Regular misting", "Quarantine new plants"]
    },
    url: "https://extension.umn.edu/yard-and-garden-insects/spider-mites"
  }
];

export async function generateHealthAssessment(
  request: HealthAssessmentRequest,
  requestId: number
): Promise<HealthAssessmentResponse> {
  // Simulate processing time
  const processingStart = new Date().toISOString();
  
  // Mock health assessment logic
  const isHealthy = Math.random() > 0.3; // 70% chance of being healthy
  const healthProbability = isHealthy ? 0.8 + Math.random() * 0.2 : 0.1 + Math.random() * 0.4;
  
  let diseaseSuggestions: DiseaseSuggestion[] = [];
  let question = undefined;
  
  if (!isHealthy) {
    // Select 1-2 random diseases
    const numDiseases = Math.random() > 0.7 ? 2 : 1;
    const selectedDiseases = MOCK_DISEASES
      .sort(() => Math.random() - 0.5)
      .slice(0, numDiseases);
    
    // Parse requested details
    const requestedDetails = request.details?.split(",").map(d => d.trim()) || [];
    
    diseaseSuggestions = selectedDiseases.map((disease, index) => ({
      id: disease.id,
      name: disease.name,
      probability: (0.7 - index * 0.2) + Math.random() * 0.2, // First disease has higher probability
      redundant: index > 0 && Math.random() > 0.7 ? true : undefined,
      similar_images: generateSimilarImages(),
      details: buildDiseaseDetails(disease, requestedDetails)
    }));

    // Generate a follow-up question if there are multiple suggestions
    if (diseaseSuggestions.length > 1) {
      question = {
        text: "Are there any visible spots or lesions on the leaves?",
        options: diseaseSuggestions.slice(0, 2).map((suggestion, index) => ({
          suggestion_index: index,
          entity_id: suggestion.id,
          name: index === 0 ? "Yes" : "No",
        }))
      };
    }
  }
  
  // Simulate processing completion time
  const processingEnd = new Date().toISOString();
  
  // Generate access token
  const accessToken = generateAccessToken(requestId);
  
  return {
    access_token: accessToken,
    custom_id: request.custom_id,
    result: {
      is_healthy: {
        probability: healthProbability,
        threshold: 0.5,
        binary: isHealthy
      },
      disease: {
        suggestions: diseaseSuggestions.sort((a, b) => b.probability - a.probability),
        question: question
      }
    },
    status: "COMPLETED",
    sla_compliant_client: true,
    sla_compliant_system: true,
    created: processingStart,
    completed: processingEnd
  };
}

function buildDiseaseDetails(disease: typeof MOCK_DISEASES[0], requestedDetails: string[]) {
  const details: any = {};
  
  if (requestedDetails.includes("local_name") || requestedDetails.length === 0) {
    details.local_name = disease.name;
  }
  
  if (requestedDetails.includes("description") || requestedDetails.length === 0) {
    details.description = disease.description;
  }
  
  if (requestedDetails.includes("url")) {
    details.url = disease.url;
  }
  
  if (requestedDetails.includes("treatment") || requestedDetails.length === 0) {
    details.treatment = disease.treatment;
  }
  
  if (requestedDetails.includes("classification")) {
    details.classification = ["Plant Disease", "Fungal Infection", disease.name];
  }
  
  if (requestedDetails.includes("common_names")) {
    details.common_names = [disease.name];
  }
  
  if (requestedDetails.includes("cause")) {
    details.cause = "Fungal pathogen";
  }
  
  return Object.keys(details).length > 0 ? details : undefined;
}

function generateSimilarImages() {
  return [
    {
      id: "dis_img_" + Math.random().toString(36).slice(2),
      url: "https://plant-id.ams3.digitaloceanspaces.com/disease_images/1/1.jpg",
      license_name: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      citation: "Plant.id - Disease Identification",
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

export async function storeHealthAssessment(
  db: D1Database,
  apiKeyId: number,
  request: HealthAssessmentRequest,
  response: HealthAssessmentResponse
): Promise<void> {
  await db.prepare(`
    INSERT INTO plant_health_assessments 
    (api_key_id, image_data, is_healthy, diseases_detected, result)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    apiKeyId,
    request.images[0], // Store first image for reference
    response.result.is_healthy.probability,
    JSON.stringify(response.result.disease.suggestions.map(s => s.name)),
    JSON.stringify(response)
  ).run();
}