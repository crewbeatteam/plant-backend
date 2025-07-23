import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { normalizeQuery, generateAccessToken, calculateSimilarity } from './utils';

// Perenual API response types
interface PerenualSpeciesResponse {
  data: PerenualSpecies[];
  to: number;
  per_page: number;
  current_page: number;
  from: number;
  last_page: number;
  total: number;
}

interface PerenualSpecies {
  id: number;
  common_name: string;
  scientific_name: string[];
  other_name: string[];
  cycle: string;
  watering: string;
  sunlight: string[];
  default_image?: {
    license: number;
    license_name: string;
    license_url: string;
    original_url: string;
    regular_url: string;
    medium_url: string;
    small_url: string;
    thumbnail: string;
  };
  // Additional optional fields
  type?: string;
  dimension?: string;
  attracts?: string[];
  propagation?: string[];
  hardiness?: {
    min: string;
    max: string;
  };
  hardiness_location?: {
    full_url: string;
    full_iframe: string;
  };
  flowers?: boolean;
  flowering_season?: string;
  color?: string;
  edible_fruit?: boolean;
  edible_fruit_taste_profile?: string;
  fruit_nutritional_value?: string;
  fruit_color?: string[];
  harvest_season?: string;
  leaf?: boolean;
  leaf_color?: string[];
  edible_leaf?: boolean;
  cuisine?: boolean;
  medicinal?: boolean;
  poisonous_to_humans?: number;
  poisonous_to_pets?: number;
  description?: string;
  problem?: string;
  growth_rate?: string;
  maintenance?: string;
  care_guides?: string;
  soil?: string[];
  growth_habit?: string;
  natural_habitat?: string[];
  indoor?: boolean;
  care_level?: string;
  pest_susceptibility?: string[];
  pest_susceptibility_api?: string;
  flowers_color?: string[];
  fruiting_season?: string;
}

export class PerenualPlantSearchProvider implements PlantSearchProvider {
  private apiKey: string;
  private baseUrl = 'https://perenual.com/api/v2';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = Math.min(request.limit || 10, 100); // Perenual supports up to 100 per request
    
    try {
      const searchParams = new URLSearchParams({
        key: this.apiKey,
        q: request.query,
        page: '1'
      });
      
      // Add filters if provided
      if (request.filters) {
        if (request.filters.indoor !== undefined) {
          searchParams.append('indoor', request.filters.indoor ? '1' : '0');
        }
        if (request.filters.edible !== undefined) {
          searchParams.append('edible', request.filters.edible ? '1' : '0');
        }
        if (request.filters.poisonous !== undefined) {
          searchParams.append('poisonous', request.filters.poisonous ? '1' : '0');
        }
        if (request.filters.cycle) {
          searchParams.append('cycle', request.filters.cycle);
        }
        if (request.filters.watering) {
          searchParams.append('watering', request.filters.watering);
        }
        if (request.filters.sunlight) {
          searchParams.append('sunlight', request.filters.sunlight);
        }
      }
      
      const url = `${this.baseUrl}/species-list?${searchParams.toString()}`;
      console.log(`Perenual API request: ${url.replace(this.apiKey, '[API_KEY]')}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Search Service)',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Perenual API error: ${response.status} ${response.statusText}`);
      }
      
      const data: PerenualSpeciesResponse = await response.json();
      const searchTime = Date.now() - startTime;
      
      console.log(`Perenual API returned ${data.data?.length || 0} raw results:`, JSON.stringify({
        total: data.total,
        to: data.to,
        per_page: data.per_page,
        current_page: data.current_page,
        first_items: data.data?.slice(0, 2)
      }, null, 4));
      
      // Convert Perenual species to our format
      const entities = this.convertPerenualToEntities(data.data, request.query, normalizedQuery);
      
      // Apply limit and sort by relevance
      const limitedEntities = entities
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, limit);
      
      return {
        entities: limitedEntities,
        entities_trimmed: data.data.length > limit || data.current_page < data.last_page,
        limit: limit,
        provider: 'perenual',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: data.total
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      console.error('Perenual search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'perenual',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'Perenual Plant API';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple query
      const testUrl = `${this.baseUrl}/species-list?key=${this.apiKey}&page=1&q=rose`;
      const response = await fetch(testUrl, {
        method: 'HEAD', // Just check if endpoint is reachable
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Availability Check)',
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Perenual availability check failed:', error);
      return false;
    }
  }
  
  shouldCache(): boolean {
    return true; // External provider results should be cached
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'Perenual Plant API',
      description: 'Comprehensive plant database with 10,000+ species including care guides, characteristics, and images',
      capabilities: {
        fuzzy_search: true,
        filters: true,
        images: true,
        taxonomy: false, // Perenual doesn't provide detailed taxonomy
        common_names: true,
        synonyms: true, // other_name field
        location_based: false
      },
      rate_limits: {
        requests_per_minute: 100, // Based on typical API limits
        requests_per_day: 1000
      },
      cost: {
        free_tier: 100, // Assumption based on typical freemium models
        cost_per_request: 0.01
      }
    };
  }
  
  /**
   * Convert Perenual species data to our PlantSearchEntity format
   */
  private convertPerenualToEntities(
    species: PerenualSpecies[], 
    originalQuery: string, 
    normalizedQuery: string
  ): PlantSearchEntity[] {
    return species.map((plant, index) => {
      // Determine what matched and calculate confidence
      const { matchedIn, matchedInType, matchPosition, confidence } = this.findBestMatch(
        plant, 
        originalQuery, 
        normalizedQuery
      );
      
      // Get primary scientific name
      const scientificName = plant.scientific_name && plant.scientific_name.length > 0 
        ? plant.scientific_name[0] 
        : plant.common_name;
      
      // Prepare common names (include the main common_name and other_name array)
      const commonNames = [plant.common_name, ...(plant.other_name || [])].filter(Boolean);
      
      const entity: PlantSearchEntity = {
        matched_in: matchedIn,
        matched_in_type: matchedInType,
        access_token: generateAccessToken(plant.id, 'perenual'),
        match_position: matchPosition,
        match_length: originalQuery.length,
        entity_name: scientificName,
        common_names: commonNames,
        synonyms: plant.other_name || [],
        thumbnail: plant.default_image?.thumbnail,
        confidence: confidence,
        provider_source: 'perenual',
        provider_id: plant.id.toString(),
        details: {
          characteristics: {
            indoor: plant.indoor,
            cycle: plant.cycle,
            care_level: plant.care_level,
            watering: plant.watering,
            sunlight: plant.sunlight ? plant.sunlight[0] : undefined, // Take first sunlight option
            edible: plant.edible_fruit || plant.edible_leaf || false,
            poisonous: plant.poisonous_to_humans === 1 || plant.poisonous_to_pets === 1,
            difficulty: plant.maintenance, // Perenual uses 'maintenance' field
            mature_height: plant.dimension,
          },
          images: plant.default_image ? [{
            url: plant.default_image.regular_url,
            thumbnail: plant.default_image.thumbnail,
            license: plant.default_image.license_name,
            attribution: plant.default_image.license_url
          }] : undefined,
          external_ids: {
            perenual_id: plant.id
          }
        }
      };
      
      return entity;
    });
  }
  
  /**
   * Find the best match in the plant data and calculate confidence
   */
  private findBestMatch(
    plant: PerenualSpecies, 
    originalQuery: string, 
    normalizedQuery: string
  ): {
    matchedIn: string;
    matchedInType: 'entity_name' | 'common_name' | 'synonym';
    matchPosition: number;
    confidence: number;
  } {
    const matches: Array<{
      text: string;
      type: 'entity_name' | 'common_name' | 'synonym';
      confidence: number;
      position: number;
    }> = [];
    
    // Check scientific names
    if (plant.scientific_name) {
      for (const sciName of plant.scientific_name) {
        const confidence = calculateSimilarity(normalizedQuery, sciName);
        const position = sciName.toLowerCase().indexOf(normalizedQuery);
        if (confidence > 0.1 || position !== -1) {
          matches.push({
            text: sciName,
            type: 'entity_name',
            confidence: confidence,
            position: Math.max(0, position)
          });
        }
      }
    }
    
    // Check common name
    if (plant.common_name) {
      const confidence = calculateSimilarity(normalizedQuery, plant.common_name);
      const position = plant.common_name.toLowerCase().indexOf(normalizedQuery);
      if (confidence > 0.1 || position !== -1) {
        matches.push({
          text: plant.common_name,
          type: 'common_name',
          confidence: confidence,
          position: Math.max(0, position)
        });
      }
    }
    
    // Check other names (synonyms)
    if (plant.other_name) {
      for (const otherName of plant.other_name) {
        const confidence = calculateSimilarity(normalizedQuery, otherName);
        const position = otherName.toLowerCase().indexOf(normalizedQuery);
        if (confidence > 0.1 || position !== -1) {
          matches.push({
            text: otherName,
            type: 'synonym',
            confidence: confidence,
            position: Math.max(0, position)
          });
        }
      }
    }
    
    // Sort by confidence and exact match preference
    matches.sort((a, b) => {
      // Prioritize exact matches
      if (a.position === 0 && b.position !== 0) return -1;
      if (b.position === 0 && a.position !== 0) return 1;
      
      // Then by confidence
      return b.confidence - a.confidence;
    });
    
    // Return best match or fallback to common name
    const bestMatch = matches[0];
    if (bestMatch) {
      return {
        matchedIn: bestMatch.text,
        matchedInType: bestMatch.type,
        matchPosition: bestMatch.position,
        confidence: bestMatch.confidence
      };
    }
    
    // Fallback if no good matches found
    return {
      matchedIn: plant.common_name || plant.scientific_name?.[0] || 'Unknown Plant',
      matchedInType: 'common_name',
      matchPosition: 0,
      confidence: 0.1
    };
  }
  
  /**
   * Get detailed plant information by ID (for plant detail endpoint)
   */
  async getPlantDetails(plantId: string): Promise<PerenualSpecies | null> {
    try {
      const url = `${this.baseUrl}/species/details/${plantId}?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Details)',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Perenual details API error: ${response.status}`);
      }
      
      const data: PerenualSpecies = await response.json();
      return data;
      
    } catch (error) {
      console.error('Perenual plant details error:', error);
      return null;
    }
  }
}
