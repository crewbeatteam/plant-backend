import type { ImageIdentifier, ImageIdentificationRequest, ImageIdentificationResult } from "./interface";

export class PlantNetIdentifier implements ImageIdentifier {
  private apiKey: string;
  private baseUrl = "https://my-api.plantnet.org/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getName(): string {
    return "PlantNet";
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple request
      const response = await fetch(`${this.baseUrl}/projects`, {
        headers: { 'Api-Key': this.apiKey }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async identify(request: ImageIdentificationRequest): Promise<ImageIdentificationResult> {
    const startTime = Date.now();

    try {
      // Convert base64 images to form data
      const formData = new FormData();
      
      for (let i = 0; i < request.images.length; i++) {
        const imageData = this.extractImageData(request.images[i]);
        const blob = new Blob([imageData], { type: 'image/jpeg' });
        formData.append('images', blob, `image${i}.jpg`);
        formData.append('organs', 'leaf'); // PlantNet requires organ specification
      }

      // Add optional parameters
      if (request.classification_level) {
        formData.append('include-related-images', request.similar_images ? 'true' : 'false');
      }

      // Call PlantNet API
      const response = await fetch(`${this.baseUrl}/identify/weurope`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`PlantNet API error: ${response.status} ${response.statusText}`);
      }

      const plantNetResult = await response.json();

      // Transform PlantNet response to our standard format
      return this.transformResponse(plantNetResult, Date.now() - startTime);

    } catch (error) {
      console.error('PlantNet identification error:', error);
      
      // Return fallback response
      return {
        is_plant: {
          probability: 0.5,
          threshold: 0.5,
          binary: false
        },
        classification: {
          suggestions: []
        },
        processing_time_ms: Date.now() - startTime,
        provider: this.getName()
      };
    }
  }

  private extractImageData(imageString: string): Uint8Array {
    // Handle both base64 and data URLs
    let base64Data: string;
    
    if (imageString.startsWith('data:')) {
      const base64Index = imageString.indexOf(',') + 1;
      base64Data = imageString.substring(base64Index);
    } else {
      base64Data = imageString;
    }

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  }

  private transformResponse(plantNetResult: any, processingTime: number): ImageIdentificationResult {
    // PlantNet response structure:
    // {
    //   "species": [
    //     {
    //       "score": 0.85,
    //       "species": {
    //         "scientificNameWithoutAuthor": "Ficus lyrata",
    //         "scientificNameAuthorship": "Warb.",
    //         "genus": { "scientificNameWithoutAuthor": "Ficus" },
    //         "family": { "scientificNameWithoutAuthor": "Moraceae" },
    //         "commonNames": ["Fiddle Leaf Fig"]
    //       },
    //       "gbif": { "id": 2984084 },
    //       "images": [...]
    //     }
    //   ]
    // }

    const suggestions = plantNetResult.species?.map((species: any, index: number) => {
      const scientificName = species.species?.scientificNameWithoutAuthor || 'Unknown';
      const commonNames = species.species?.commonNames || [];
      
      return {
        id: species.gbif?.id || index + 1000, // Use GBIF ID or fallback
        name: scientificName,
        scientific_name: scientificName,
        probability: species.score || 0,
        common_names: commonNames,
        details: {
          taxonomy: {
            kingdom: "Plantae",
            phylum: "Tracheophyta",
            class: "Magnoliopsida",
            order: species.species?.order?.scientificNameWithoutAuthor || "Unknown",
            family: species.species?.family?.scientificNameWithoutAuthor || "Unknown",
            genus: species.species?.genus?.scientificNameWithoutAuthor || "Unknown",
            species: scientificName
          },
          gbif_id: species.gbif?.id,
          similar_images: species.images?.map((img: any, imgIndex: number) => ({
            id: `plantnet_${species.gbif?.id || index}_${imgIndex}`,
            url: img.url?.o || img.url?.m || img.url?.s,
            license_name: img.licence,
            citation: `PlantNet - ${img.author || 'Unknown'}`
          }))
        }
      };
    }) || [];

    // Calculate if this looks like a plant based on top score
    const topScore = suggestions[0]?.probability || 0;
    const isPlant = topScore > 0.3; // PlantNet threshold for plant detection

    return {
      is_plant: {
        probability: isPlant ? Math.max(topScore, 0.5) : topScore,
        threshold: 0.3,
        binary: isPlant
      },
      classification: {
        suggestions: suggestions.slice(0, 5) // Limit to top 5
      },
      processing_time_ms: processingTime,
      provider: this.getName()
    };
  }
}