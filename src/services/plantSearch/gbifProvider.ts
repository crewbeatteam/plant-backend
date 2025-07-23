import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { normalizeQuery, generateAccessToken, calculateSimilarity } from './utils';

// GBIF API response types
interface GBIFSpeciesSearchResponse {
  offset: number;
  limit: number;
  endOfRecords: boolean;
  count: number;
  results: GBIFSpecies[];
}

interface GBIFSpecies {
  key: number;
  nubKey: number;
  nameKey: number;
  taxonID: string;
  sourceTaxonKey: number;
  kingdom: string;
  phylum: string;
  order: string;
  family: string;
  genus: string;
  species: string;
  kingdomKey: number;
  phylumKey: number;
  classKey: number;
  orderKey: number;
  familyKey: number;
  genusKey: number;
  speciesKey: number;
  datasetKey: string;
  constituentKey: string;
  parentKey: number;
  parent: string;
  acceptedKey: number;
  accepted: string;
  basionymKey: number;
  basionym: string;
  scientificName: string;
  canonicalName: string;
  vernacularName?: string;
  authorship: string;
  nameType: string;
  rank: string;
  origin: string;
  taxonomicStatus: string;
  nomenclaturalStatus: string[];
  remarks: string;
  numDescendants: number;
  lastCrawled: string;
  lastInterpreted: string;
  issues: string[];
  synonym: boolean;
  class: string;
}

export class GBIFPlantSearchProvider implements PlantSearchProvider {
  private baseUrl = 'https://api.gbif.org/v1';
  private plantsHigherTaxonKey = 7707728; // GBIF key for vascular plants
  
  constructor() {
    // GBIF doesn't require API key for basic operations
  }
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = Math.min(request.limit || 10, 100); // GBIF supports up to 1000, but we'll be conservative
    
    try {
      const searchParams = new URLSearchParams({
        q: request.query,
        limit: limit.toString(),
        offset: '0',
        rank: 'SPECIES', // Focus on species level
        status: 'ACCEPTED', // Only accepted names
        highertaxon_key: this.plantsHigherTaxonKey.toString(), // Only vascular plants
        facet: 'false' // Disable facets for faster response
      });
      
      // Add language if specified
      if (request.language && request.language !== 'en') {
        searchParams.append('hl', request.language);
      }
      
      const url = `${this.baseUrl}/species/search?${searchParams.toString()}`;
      console.log(`GBIF API request: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Search Service)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GBIF API error: ${response.status} ${response.statusText}`);
      }
      
      const data: GBIFSpeciesSearchResponse = await response.json();
      const searchTime = Date.now() - startTime;
      
      console.log(`GBIF API returned ${data.results?.length || 0} raw results:`, {
        count: data.count,
        offset: data.offset,
        limit: data.limit,
        endOfRecords: data.endOfRecords,
        first_items: data.results?.slice(0, 2)
      });
      
      // Convert GBIF species to our format
      const entities = await this.convertGBIFToEntities(data.results, request.query, normalizedQuery);
      
      // Sort by relevance
      const sortedEntities = entities
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, limit);
      
      return {
        entities: sortedEntities,
        entities_trimmed: data.results.length >= limit && !data.endOfRecords,
        limit: limit,
        provider: 'gbif',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: data.count
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      console.error('GBIF search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'gbif',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'GBIF Species API';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple query
      const testUrl = `${this.baseUrl}/species/search?q=Quercus&limit=1`;
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Availability Check)',
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('GBIF availability check failed:', error);
      return false;
    }
  }
  
  shouldCache(): boolean {
    return true; // External provider results should be cached
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'GBIF Species API',
      description: 'Global Biodiversity Information Facility - comprehensive taxonomic database with scientific accuracy',
      capabilities: {
        fuzzy_search: true,
        filters: false, // GBIF has limited filtering options
        images: false, // GBIF focuses on taxonomy, not images
        taxonomy: true, // Excellent taxonomic data
        common_names: true, // Some vernacular names
        synonyms: true, // Comprehensive synonym data
        location_based: false // Not relevant for name search
      },
      rate_limits: {
        requests_per_minute: 1000, // GBIF is quite generous
        requests_per_day: 100000
      },
      cost: {
        free_tier: -1, // Completely free
        cost_per_request: 0
      }
    };
  }
  
  /**
   * Convert GBIF species data to our PlantSearchEntity format
   */
  private async convertGBIFToEntities(
    species: GBIFSpecies[], 
    originalQuery: string, 
    normalizedQuery: string
  ): Promise<PlantSearchEntity[]> {
    const entities: PlantSearchEntity[] = [];
    
    for (let i = 0; i < species.length; i++) {
      const plant = species[i];
      
      // Determine what matched and calculate confidence
      const { matchedIn, matchedInType, matchPosition, confidence } = this.findBestMatch(
        plant, 
        originalQuery, 
        normalizedQuery
      );
      
      // Get common names if available
      const commonNames: string[] = [];
      if (plant.vernacularName) {
        commonNames.push(plant.vernacularName);
      }
      
      // Try to get additional vernacular names from GBIF
      try {
        const vernacularNames = await this.getVernacularNames(plant.key);
        commonNames.push(...vernacularNames);
      } catch (error) {
        // Don't fail the whole search if vernacular names fail
        console.warn(`Failed to get vernacular names for ${plant.scientificName}:`, error);
      }
      
      const entity: PlantSearchEntity = {
        matched_in: matchedIn,
        matched_in_type: matchedInType,
        access_token: generateAccessToken(plant.key, 'gbif'),
        match_position: matchPosition,
        match_length: originalQuery.length,
        entity_name: plant.scientificName,
        common_names: [...new Set(commonNames)].filter(Boolean), // Remove duplicates and empty values
        synonyms: [], // We'll populate this if we fetch synonyms separately
        thumbnail: undefined, // GBIF doesn't provide images
        confidence: confidence,
        provider_source: 'gbif',
        provider_id: plant.key.toString(),
        details: {
          taxonomy: {
            kingdom: plant.kingdom,
            phylum: plant.phylum,
            class: plant.class,
            order: plant.order,
            family: plant.family,
            genus: plant.genus,
            species: plant.species
          },
          external_ids: {
            gbif_id: plant.key
          }
        }
      };
      
      entities.push(entity);
    }
    
    return entities;
  }
  
  /**
   * Find the best match in the GBIF plant data
   */
  private findBestMatch(
    plant: GBIFSpecies, 
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
    
    // Check scientific name
    if (plant.scientificName) {
      const confidence = calculateSimilarity(normalizedQuery, plant.scientificName);
      const position = plant.scientificName.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: plant.scientificName,
        type: 'entity_name',
        confidence: confidence,
        position: Math.max(0, position)
      });
    }
    
    // Check canonical name (simplified scientific name)
    if (plant.canonicalName && plant.canonicalName !== plant.scientificName) {
      const confidence = calculateSimilarity(normalizedQuery, plant.canonicalName);
      const position = plant.canonicalName.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: plant.canonicalName,
        type: 'entity_name',
        confidence: confidence,
        position: Math.max(0, position)
      });
    }
    
    // Check vernacular name
    if (plant.vernacularName) {
      const confidence = calculateSimilarity(normalizedQuery, plant.vernacularName);
      const position = plant.vernacularName.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: plant.vernacularName,
        type: 'common_name',
        confidence: confidence,
        position: Math.max(0, position)
      });
    }
    
    // Sort by confidence and exact match preference
    matches.sort((a, b) => {
      // Prioritize exact matches at start
      if (a.position === 0 && b.position !== 0) return -1;
      if (b.position === 0 && a.position !== 0) return 1;
      
      // Then by confidence
      return b.confidence - a.confidence;
    });
    
    // Return best match or fallback
    const bestMatch = matches[0];
    if (bestMatch && bestMatch.confidence > 0.1) {
      return {
        matchedIn: bestMatch.text,
        matchedInType: bestMatch.type,
        matchPosition: bestMatch.position,
        confidence: bestMatch.confidence
      };
    }
    
    // Fallback
    return {
      matchedIn: plant.scientificName || plant.canonicalName || 'Unknown Species',
      matchedInType: 'entity_name',
      matchPosition: 0,
      confidence: 0.1
    };
  }
  
  /**
   * Get vernacular (common) names for a species
   */
  private async getVernacularNames(speciesKey: number): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/species/${speciesKey}/vernacularNames`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Vernacular Names)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data: any = await response.json();
      const names: string[] = [];
      
      if (data.results && Array.isArray(data.results)) {
        for (const result of data.results) {
          if (result.vernacularName && result.vernacularName.trim()) {
            names.push(result.vernacularName.trim());
          }
        }
      }
      
      return [...new Set(names)]; // Remove duplicates
      
    } catch (error) {
      console.warn('Failed to fetch vernacular names:', error);
      return [];
    }
  }
  
  /**
   * Get species details by GBIF key
   */
  async getSpeciesDetails(gbifKey: string): Promise<GBIFSpecies | null> {
    try {
      const url = `${this.baseUrl}/species/${gbifKey}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Species Details)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GBIF details API error: ${response.status}`);
      }
      
      const data: GBIFSpecies = await response.json();
      return data;
      
    } catch (error) {
      console.error('GBIF species details error:', error);
      return null;
    }
  }
  
  /**
   * Get synonyms for a species
   */
  async getSynonyms(speciesKey: number): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/species/${speciesKey}/synonyms`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Synonyms)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data: any = await response.json();
      const synonyms: string[] = [];
      
      if (data.results && Array.isArray(data.results)) {
        for (const result of data.results) {
          if (result.scientificName && result.scientificName.trim()) {
            synonyms.push(result.scientificName.trim());
          }
        }
      }
      
      return [...new Set(synonyms)]; // Remove duplicates
      
    } catch (error) {
      console.warn('Failed to fetch synonyms:', error);
      return [];
    }
  }
}