import type { ImageIdentifier, ImageIdentificationRequest, ImageIdentificationResult } from "./interface";

export class PlantNetIdentifier implements ImageIdentifier {
  private apiKey: string;
  private baseUrl = "https://my-api.plantnet.org/v2";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getName(): string {
    return "PlantNet";
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple request to v2 projects endpoint
      const response = await fetch(`${this.baseUrl}/projects?api-key=${this.apiKey}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async identify(request: ImageIdentificationRequest): Promise<ImageIdentificationResult> {
    const startTime = Date.now();

    try {
      // Use original files if available, otherwise fetch from R2 URLs
      const formData = new FormData();
      
      console.log('PlantNet: Processing', request.images.length, 'images');
      
      // Add all images first
      for (let i = 0; i < request.images.length; i++) {
        let blob: Blob;
        
        if (request.files && request.files[i]) {
          // Use original file if available
          blob = request.files[i];
          console.log(`PlantNet: Using original file ${i} (${blob.size} bytes)`);
        } else {
          // Fetch from R2 URL
          const response = await fetch(request.images[i]);
          if (!response.ok) {
            throw new Error(`Failed to fetch image from ${request.images[i]}`);
          }
          blob = await response.blob();
          console.log(`PlantNet: Fetched from R2 ${i} (${blob.size} bytes)`);
        }
        
        formData.append('images', blob, `image${i}.jpg`);
      }
      
      // Add organs for each image (must match number of images)
      for (let i = 0; i < request.images.length; i++) {
        formData.append('organs', 'auto'); // Let AI detect the organ
      }
      console.log(`PlantNet: Added ${request.images.length} organs (all auto)`);

      // Build URL with query parameters (not FormData)
      const urlParams = new URLSearchParams();
      urlParams.append('api-key', this.apiKey);
      
      // Add optional parameters as query params
      if (request.similar_images) {
        urlParams.append('include-related-images', 'true');
        console.log('PlantNet: Added include-related-images=true');
      }
      
      // Limit results for better performance
      urlParams.append('nb-results', '5');
      console.log('PlantNet: Added nb-results=5');
      
      // Set language if provided
      if (request.language) {
        urlParams.append('lang', request.language);
        console.log('PlantNet: Added lang=' + request.language);
      }

      // Call PlantNet API v2 - use the identify endpoint with all projects
      const url = `${this.baseUrl}/identify/all?${urlParams.toString()}`;
      console.log('PlantNet API URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PlantNet API error response:', errorText);
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

  // Removed extractImageData - no longer needed as we use files/URLs directly

  private transformResponse(plantNetResult: any, processingTime: number): ImageIdentificationResult {
    // PlantNet v2 response structure:
    // {
    //   "query": {},
    //   "predictedOrgans": [],
    //   "bestMatch": "Ajuga genevensis L.",
    //   "results": [
    //     {
    //       "score": 0.90734,
    //       "species": {
    //         "scientificNameWithoutAuthor": "Ajuga genevensis",
    //         "scientificNameAuthorship": "L.",
    //         "genus": { "scientificNameWithoutAuthor": "Ajuga" },
    //         "family": { "scientificNameWithoutAuthor": "Lamiaceae" },
    //         "commonNames": ["Blue bugleweed", "Blue bugle"],
    //         "scientificName": "Ajuga genevensis L."
    //       },
    //       "gbif": { "id": "2927079" },
    //       "powo": { "id": "444576-1" }
    //     }
    //   ]
    // }

    const suggestions = plantNetResult.results?.map((result: any, index: number) => {
      const scientificName = result.species?.scientificNameWithoutAuthor || 'Unknown';
      const commonNames = result.species?.commonNames || [];
      
      return {
        id: parseInt(result.gbif?.id) || index + 1000, // Use GBIF ID or fallback
        name: scientificName,
        scientific_name: result.species?.scientificName || scientificName,
        probability: result.score || 0,
        confirmed: false,
        common_names: commonNames,
        details: {
          taxonomy: {
            kingdom: "Plantae",
            phylum: "Tracheophyta",
            class: "Magnoliopsida",
            order: "Unknown", // Not provided in v2 response
            family: result.species?.family?.scientificNameWithoutAuthor || "Unknown",
            genus: result.species?.genus?.scientificNameWithoutAuthor || "Unknown",
            species: scientificName
          },
          gbif_id: parseInt(result.gbif?.id),
          powo_id: result.powo?.id,
          similar_images: result.images?.map((img: any, imgIndex: number) => ({
            id: `plantnet_${result.gbif?.id || index}_${imgIndex}`,
            url: img.url?.o || img.url?.m || img.url?.s,
            license_name: img.licence,
            citation: `PlantNet - ${img.author || 'Unknown'}`
          }))
        }
      };
    }) || [];

    // Calculate if this looks like a plant based on top score
    const topScore = suggestions[0]?.probability || 0;
    const isPlant = topScore > 0.1; // PlantNet threshold for plant detection

    return {
      is_plant: {
        probability: isPlant ? Math.max(topScore, 0.5) : topScore,
        threshold: 0.1,
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