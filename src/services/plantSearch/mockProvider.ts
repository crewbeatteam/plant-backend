import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { normalizeQuery, generateAccessToken, calculateSimilarity } from './utils';
import { MOCK_PLANT_SPECIES } from '../plantIdentification';

export class MockPlantSearchProvider implements PlantSearchProvider {
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = request.limit || 10;
    
    try {
      // Search through mock plant species data
      const results = this.searchMockPlants(request.query, normalizedQuery, limit);
      const searchTime = Date.now() - startTime;
      
      console.log(`Mock provider found ${results.length} results for "${request.query}"`, {
        first_items: results.slice(0, 2)
      });
      
      return {
        entities: results,
        entities_trimmed: results.length >= limit,
        limit: limit,
        provider: 'mock',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: results.length
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      console.error('Mock plant search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'mock',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'Mock Plant Database';
  }
  
  async isAvailable(): Promise<boolean> {
    // Mock provider is always available
    return true;
  }
  
  shouldCache(): boolean {
    // Mock provider results don't need to be cached since they're local
    return false;
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'Mock Plant Database',
      description: `Local mock database with ${MOCK_PLANT_SPECIES.length} plant species for testing and fallback purposes`,
      capabilities: {
        fuzzy_search: true,
        filters: false,
        images: true,
        taxonomy: true,
        common_names: true,
        synonyms: false,
        location_based: false
      },
      rate_limits: {
        requests_per_minute: 10000,
        requests_per_day: 1000000
      },
      cost: {
        free_tier: -1, // Unlimited
        cost_per_request: 0
      }
    };
  }
  
  /**
   * Search through mock plant species data
   */
  private searchMockPlants(
    originalQuery: string, 
    normalizedQuery: string, 
    limit: number
  ): PlantSearchEntity[] {
    const results: Array<{
      entity: PlantSearchEntity;
      relevanceScore: number;
    }> = [];
    
    for (const plant of MOCK_PLANT_SPECIES) {
      const matches = this.findMatches(plant, originalQuery, normalizedQuery);
      
      // Add all matches for this plant
      for (const match of matches) {
        results.push({
          entity: {
            matched_in: match.matchedIn,
            matched_in_type: match.matchedInType,
            access_token: generateAccessToken(plant.id, 'mock'),
            match_position: match.position,
            match_length: originalQuery.length,
            entity_name: plant.name,
            common_names: plant.common_names,
            synonyms: [], // Mock data doesn't have synonyms
            thumbnail: plant.wikipedia?.image,
            confidence: match.confidence,
            provider_source: 'mock',
            provider_id: plant.id.toString(),
            details: {
              taxonomy: plant.taxonomy,
              external_ids: {
                gbif_id: plant.gbif_id,
                inaturalist_id: plant.inaturalist_id
              },
              images: plant.wikipedia?.image ? [{
                url: plant.wikipedia.image,
                thumbnail: plant.wikipedia.image
              }] : undefined,
              wikipedia: plant.wikipedia
            }
          },
          relevanceScore: match.confidence
        });
      }
      
      // Stop if we have enough results
      if (results.length >= limit * 3) break; // Get extra for better sorting
    }
    
    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit)
      .map(result => result.entity);
  }
  
  /**
   * Find all matches for a plant in different name fields
   */
  private findMatches(
    plant: typeof MOCK_PLANT_SPECIES[0],
    originalQuery: string,
    normalizedQuery: string
  ): Array<{
    matchedIn: string;
    matchedInType: 'entity_name' | 'common_name' | 'synonym';
    position: number;
    confidence: number;
  }> {
    const matches: Array<{
      matchedIn: string;
      matchedInType: 'entity_name' | 'common_name' | 'synonym';
      position: number;
      confidence: number;
    }> = [];
    
    // Check scientific name
    const scientificMatch = plant.name.toLowerCase().indexOf(normalizedQuery);
    if (scientificMatch !== -1) {
      const confidence = calculateSimilarity(normalizedQuery, plant.name);
      matches.push({
        matchedIn: plant.name,
        matchedInType: 'entity_name',
        position: scientificMatch,
        confidence: confidence
      });
    }
    
    // Check genus match (often useful for partial searches)
    if (plant.genus) {
      const genusMatch = plant.genus.toLowerCase().indexOf(normalizedQuery);
      if (genusMatch !== -1) {
        const confidence = calculateSimilarity(normalizedQuery, plant.genus) * 0.8; // Slightly lower for genus
        matches.push({
          matchedIn: plant.genus,
          matchedInType: 'entity_name',
          position: genusMatch,
          confidence: confidence
        });
      }
    }
    
    // Check common names
    for (const commonName of plant.common_names) {
      const commonMatch = commonName.toLowerCase().indexOf(normalizedQuery);
      if (commonMatch !== -1) {
        const confidence = calculateSimilarity(normalizedQuery, commonName);
        matches.push({
          matchedIn: commonName,
          matchedInType: 'common_name',
          position: commonMatch,
          confidence: confidence
        });
      }
    }
    
    // Return matches with confidence above threshold
    return matches.filter(match => match.confidence > 0.1);
  }
  
  /**
   * Get plant details by ID (for compatibility with other providers)
   */
  getPlantDetails(plantId: string): typeof MOCK_PLANT_SPECIES[0] | null {
    const id = parseInt(plantId);
    return MOCK_PLANT_SPECIES.find(plant => plant.id === id) || null;
  }
  
  /**
   * Get all available plants (for testing/debugging)
   */
  getAllPlants(): typeof MOCK_PLANT_SPECIES {
    return MOCK_PLANT_SPECIES;
  }
  
  /**
   * Get random plant suggestions
   */
  getRandomPlants(count: number = 5): PlantSearchEntity[] {
    const shuffled = [...MOCK_PLANT_SPECIES].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);
    
    return selected.map(plant => ({
      matched_in: plant.name,
      matched_in_type: 'entity_name' as const,
      access_token: generateAccessToken(plant.id, 'mock'),
      match_position: 0,
      match_length: plant.name.length,
      entity_name: plant.name,
      common_names: plant.common_names,
      synonyms: [],
      thumbnail: plant.wikipedia?.image,
      confidence: 1.0,
      provider_source: 'mock',
      provider_id: plant.id.toString(),
      details: {
        taxonomy: plant.taxonomy,
        external_ids: {
          gbif_id: plant.gbif_id,
          inaturalist_id: plant.inaturalist_id
        },
        images: plant.wikipedia?.image ? [{
          url: plant.wikipedia.image,
          thumbnail: plant.wikipedia.image
        }] : undefined,
        wikipedia: plant.wikipedia
      }
    }));
  }
}