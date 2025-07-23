import type { ImageIdentifier, ImageIdentificationRequest, ImageIdentificationResult } from "./interface";
import { MOCK_PLANT_SPECIES } from "../plantIdentification";

export class MockIdentifier implements ImageIdentifier {
  
  getName(): string {
    return "Mock Identifier";
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock is always available
  }

  async identify(request: ImageIdentificationRequest): Promise<ImageIdentificationResult> {
    const startTime = Date.now();
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Mock ML prediction logic
    const randomSpecies = MOCK_PLANT_SPECIES[Math.floor(Math.random() * MOCK_PLANT_SPECIES.length)];
    const secondChoice = MOCK_PLANT_SPECIES.find(s => s.id !== randomSpecies.id) || MOCK_PLANT_SPECIES[0];
    
    // Parse requested details
    const requestedDetails = this.parseDetails(request);
    
    // Build plant suggestions
    const suggestions = [
      {
        id: randomSpecies.id,
        name: randomSpecies.name,
        scientific_name: randomSpecies.name,
        probability: 0.85 + Math.random() * 0.1, // 85-95%
        confirmed: false,
        common_names: randomSpecies.common_names,
        details: this.buildPlantDetails(randomSpecies, requestedDetails),
        ...(request.similar_images && { similar_images: this.generateSimilarImages(randomSpecies.id) })
      },
      {
        id: secondChoice.id,
        name: secondChoice.name,
        scientific_name: secondChoice.name,
        probability: 0.05 + Math.random() * 0.15, // 5-20%
        confirmed: false,
        common_names: secondChoice.common_names,
        details: this.buildPlantDetails(secondChoice, requestedDetails),
        ...(request.similar_images && { similar_images: this.generateSimilarImages(secondChoice.id) })
      }
    ];

    const processingTime = Date.now() - startTime;

    return {
      is_plant: {
        probability: 0.95 + Math.random() * 0.05, // 95-100%
        threshold: 0.5,
        binary: true
      },
      classification: {
        suggestions: suggestions.sort((a, b) => b.probability - a.probability)
      },
      processing_time_ms: processingTime,
      provider: this.getName()
    };
  }

  private parseDetails(request: ImageIdentificationRequest): string[] {
    // For mock, we'll include common details
    return ['common_names', 'taxonomy', 'wikipedia', 'gbif_id', 'inaturalist_id'];
  }

  private buildPlantDetails(species: typeof MOCK_PLANT_SPECIES[0], requestedDetails: string[]) {
    const details: any = {};
    
    if (requestedDetails.includes('taxonomy')) {
      details.taxonomy = species.taxonomy;
    }
    
    if (requestedDetails.includes('gbif_id')) {
      details.gbif_id = species.gbif_id;
    }
    
    if (requestedDetails.includes('inaturalist_id')) {
      details.inaturalist_id = species.inaturalist_id;
    }
    
    if (requestedDetails.includes('wikipedia')) {
      details.wikipedia = species.wikipedia;
    }
    
    return Object.keys(details).length > 0 ? details : undefined;
  }

  private generateSimilarImages(speciesId: number) {
    return [
      {
        id: `mock_${speciesId}_1`,
        url: "https://plant-id.ams3.digitaloceanspaces.com/similar_images/1/1.jpg",
        license_name: "CC BY-SA 4.0",
        license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
        citation: "Mock Plant Database",
      },
      {
        id: `mock_${speciesId}_2`,
        url: "https://plant-id.ams3.digitaloceanspaces.com/similar_images/1/2.jpg",
        license_name: "CC BY 2.0",
        license_url: "https://creativecommons.org/licenses/by/2.0/",
        citation: "Mock Plant Database",
      }
    ];
  }
}