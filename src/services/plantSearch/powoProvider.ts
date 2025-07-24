import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { normalizeQuery, generateAccessToken, calculateSimilarity } from './utils';
import { POWOClient, POWOTaxon, Filters, Include } from './pykew';

// POWO API response types based on research from pykew and kewr libraries
interface POWOSearchResponse {
  cursor?: string;
  size: number;
  results: POWOResult[];
}

interface POWOResult {
  name: string;
  fqId: string;  // Fully qualified ID
  rank?: string;
  kingdom?: string;
  family?: string;
  genus?: string;
  species?: string;
  author?: string;
  basionym?: string;
  synonymOf?: {
    fqId: string;
    name: string;
    author?: string;
  };
  accepted?: boolean;
  distribution?: POWODistribution;
  images?: POWOImage[];
  url?: string;
}

interface POWODistribution {
  introduction?: string[];
  native?: string[];
  extinct?: string[];
  doubtful?: string[];
}

interface POWOImage {
  caption?: string;
  file?: string;
  publisher?: string;
  license?: string;
}

interface POWOSuggestResponse {
  suggestions: {
    'scientific-name': POWOSuggestionItem[];
    'location': POWOSuggestionItem[];
    'common-name': POWOSuggestionItem[];
  };
  suggestedTerms: {
    'scientific-name': string[];
    'location': string[];
    'common-name': string[];
  };
}

interface POWOSuggestionItem {
  term: string;
  weight: number;
  payload: string;
}

// Global cache to persist between provider instances
const POWO_PLANT_CACHE = new Map<number, string>();

export class POWOPlantSearchProvider implements PlantSearchProvider {
  private baseUrl = 'https://powo.science.kew.org/api/1'; // Keep for suggest endpoint
  private powoClient: POWOClient;
  
  constructor() {
    // POWO API doesn't require authentication
    this.powoClient = new POWOClient();
  }
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = Math.min(request.limit || 10, 50); // POWO typically returns up to 50 results
    
    try {
      console.log(`POWO search starting with query: "${request.query}"`);
      
      // Try the pykew-style search first for more comprehensive results
      const pykewResults = await this.searchWithPykew(request, normalizedQuery, limit, startTime);
      if (pykewResults.entities.length > 0) {
        console.log(`POWO pykew search succeeded with ${pykewResults.entities.length} results`);
        return pykewResults;
      }
      
      console.log('POWO pykew search returned no results, trying suggest API...');
      
      // Fallback to suggest endpoint for faster name-based searches
      let searchUrl = `${this.baseUrl}/suggest?query=${encodeURIComponent(request.query)}`;
      
      console.log(`POWO API suggest request: ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Search Service)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`POWO suggest failed (${response.status}), trying search endpoint`);
        return await this.fallbackToSearchEndpoint(request, normalizedQuery, limit, startTime);
      }
      
      // Process suggest response
      const suggestData: POWOSuggestResponse = await response.json();
      const searchTime = Date.now() - startTime;
      
      const scientificNames = suggestData.suggestedTerms?.['scientific-name'] || [];
      const commonNames = suggestData.suggestedTerms?.['common-name'] || [];
      
      console.log(`POWO suggest API returned ${scientificNames.length} scientific names and ${commonNames.length} common names:`, JSON.stringify({
        scientific_names: scientificNames.slice(0, 3),
        common_names: commonNames.slice(0, 3)
      }, null, 4));
      
      // Check if we have valid suggestions
      if (scientificNames.length === 0 && commonNames.length === 0) {
        console.log('POWO suggest returned no valid suggestions, trying search endpoint');
        
        // Fallback to search endpoint
        return await this.fallbackToSearchEndpoint(request, normalizedQuery, limit, startTime);
      }
      
      // Convert POWO suggestions to our format
      const entities = this.convertPOWOSuggestToEntities(scientificNames, commonNames, request.query, normalizedQuery);
      
      // Apply limit and sort by relevance
      const limitedEntities = entities
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, limit);
      
      return {
        entities: limitedEntities,
        entities_trimmed: (scientificNames.length + commonNames.length) > limit,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: scientificNames.length + commonNames.length
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      console.error('POWO search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'Plants of the World Online (POWO)';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple suggest query
      const testUrl = `${this.baseUrl}/suggest?query=Quercus`;
      const response = await fetch(testUrl, {
        method: 'HEAD', // Just check if endpoint is reachable
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Availability Check)',
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('POWO availability check failed:', error);
      return false;
    }
  }
  
  shouldCache(): boolean {
    return true; // External provider results should be cached
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'Plants of the World Online (POWO)',
      description: 'Authoritative taxonomic database from Royal Botanic Gardens, Kew with 1.4M+ plant names and comprehensive nomenclatural data',
      capabilities: {
        fuzzy_search: true,
        filters: false, // POWO has limited filter support
        images: true,
        taxonomy: true, // Excellent taxonomic data from Kew
        common_names: true,
        synonyms: true,
        location_based: true // Has distribution data
      },
      rate_limits: {
        requests_per_minute: 100, // Conservative estimate since API is undocumented
        requests_per_day: 2000
      },
      cost: {
        free_tier: 1000000, // POWO is completely free
        cost_per_request: 0
      }
    };
  }
  
  /**
   * Search using pykew-style client for comprehensive results
   */
  private async searchWithPykew(
    request: PlantSearchRequest,
    normalizedQuery: string,
    limit: number,
    originalStartTime: number
  ): Promise<PlantSearchResult> {
    try {
      console.log(`POWO pykew search: "${request.query}"`);
      
      // Build search filters
      const filters = [Filters.ACCEPTED_NAMES];
      if (request.filters?.indoor === false) {
        // No specific filter for indoor/outdoor in POWO
      }
      
      // Use comprehensive search with includes
      const searchResult = this.powoClient.searchComprehensive(request.query, {
        filters,
        size: limit,
        include: [Include.DISTRIBUTION, Include.IMAGES],
      });
      
      // Get results from the search
      const taxa = await searchResult.take(limit);
      const searchTime = Date.now() - originalStartTime;
      
      console.log(`POWO pykew returned ${taxa.length} taxa`);
      
      if (taxa.length === 0) {
        return {
          entities: [],
          entities_trimmed: false,
          limit: limit,
          provider: 'powo',
          cached: false,
          search_time_ms: searchTime,
          query_normalized: normalizedQuery,
          total_found: 0
        };
      }
      
      // Convert POWO taxa to our format
      const entities = this.convertPOWOTaxaToEntities(taxa, request.query, normalizedQuery);
      
      // Apply limit and sort by relevance
      const limitedEntities = entities
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, limit);
      
      return {
        entities: limitedEntities,
        entities_trimmed: taxa.length > limit,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: taxa.length
      };
      
    } catch (error) {
      console.error('POWO pykew search error:', error);
      const searchTime = Date.now() - originalStartTime;
      
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }

  /**
   * Fallback to search endpoint when suggest fails or returns no results
   */
  private async fallbackToSearchEndpoint(
    request: PlantSearchRequest,
    normalizedQuery: string,
    limit: number,
    originalStartTime: number
  ): Promise<PlantSearchResult> {
    try {
      const searchParams = new URLSearchParams({
        q: request.query,
        f: 'accepted_names', // Filter for accepted names
        limit: limit.toString()
      });
      
      const searchUrl = `${this.baseUrl}/search?${searchParams.toString()}`;
      console.log(`POWO API search request: ${searchUrl}`);
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Search Service)',
          'Accept': 'application/json'
        }
      });
      
      if (!searchResponse.ok) {
        throw new Error(`POWO search API error: ${searchResponse.status} ${searchResponse.statusText}`);
      }
      
      const searchData: POWOSearchResponse = await searchResponse.json();
      const searchTime = Date.now() - originalStartTime;
      
      console.log(`POWO search API returned ${searchData.results?.length || 0} results:`, JSON.stringify({
        size: searchData.size,
        cursor: searchData.cursor,
        first_items: searchData.results?.slice(0, 2)
      }, null, 4));
      
      // Check if we have valid results
      if (!searchData.results || !Array.isArray(searchData.results)) {
        console.log('POWO search returned no valid results');
        return {
          entities: [],
          entities_trimmed: false,
          limit: limit,
          provider: 'powo',
          cached: false,
          search_time_ms: searchTime,
          query_normalized: normalizedQuery,
          total_found: 0
        };
      }
      
      // Convert POWO search results to our format
      const entities = this.convertPOWOSearchToEntities(searchData.results, request.query, normalizedQuery);
      
      // Apply limit and sort by relevance
      const limitedEntities = entities
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, limit);
      
      return {
        entities: limitedEntities,
        entities_trimmed: searchData.results.length > limit,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: searchData.size || searchData.results.length
      };
      
    } catch (error) {
      const searchTime = Date.now() - originalStartTime;
      console.error('POWO search endpoint fallback error:', error);
      
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'powo',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }

  /**
   * Convert POWO taxa from pykew client to our PlantSearchEntity format
   */
  private convertPOWOTaxaToEntities(
    taxa: POWOTaxon[],
    originalQuery: string,
    normalizedQuery: string
  ): PlantSearchEntity[] {
    return taxa.map((taxon, index) => {
      // Calculate confidence based on name similarity
      const confidence = calculateSimilarity(normalizedQuery, taxon.name);
      const matchPosition = taxon.name.toLowerCase().indexOf(normalizedQuery);
      
      // Extract POWO ID from fqId
      const powoId = this.extractPOWOId(taxon.fqId);
      
      // Cache the plant name for later retrieval in getDetails
      POWO_PLANT_CACHE.set(powoId, taxon.name);
      console.log(`POWO: Cached taxon "${taxon.name}" with ID ${powoId} (fqId: ${taxon.fqId})`);
      
      // Extract taxonomy information
      const taxonomy = {
        kingdom: taxon.kingdom || 'Plantae',
        phylum: 'Tracheophyta',
        class: 'Magnoliopsida', 
        order: 'Unknown',
        family: taxon.family || 'Unknown',
        genus: taxon.genus || 'Unknown',
        species: taxon.species || taxon.name
      };
      
      const entity: PlantSearchEntity = {
        matched_in: taxon.name,
        matched_in_type: 'entity_name',
        access_token: generateAccessToken(powoId, 'powo'),
        match_position: Math.max(0, matchPosition),
        match_length: originalQuery.length,
        entity_name: taxon.name,
        common_names: taxon.vernacularNames?.map(vn => vn.name) || [],
        synonyms: taxon.synonyms?.map(s => s.name) || [],
        thumbnail: taxon.images?.[0]?.thumbnailUrl || taxon.images?.[0]?.url,
        confidence: confidence,
        provider_source: 'powo',
        provider_id: taxon.fqId,
        details: {
          taxonomy: taxonomy,
          characteristics: {
            rank: taxon.rank,
            taxonomic_status: taxon.accepted ? 'accepted' : 'synonym',
            nomenclatural_status: taxon.nomenclaturalStatus,
            authorship: taxon.authors,
            canonical_name: taxon.name,
            basionym: taxon.basionym,
            // POWO-specific characteristics
            distribution_native: taxon.distribution?.natives?.join(', '),
            distribution_introduced: taxon.distribution?.introduced?.join(', '),
            distribution_extinct: taxon.distribution?.extinct?.join(', '),
            distribution_doubtful: taxon.distribution?.doubtful?.join(', ')
          },
          images: taxon.images ? taxon.images.map(img => ({
            url: img.url,
            thumbnail: img.thumbnailUrl || img.url,
            license: img.license,
            attribution: img.publisher,
            caption: img.caption
          })) : undefined,
          external_ids: {
            powo_id: powoId
          },
          wikipedia: taxon.bibliography?.find(b => b.url)
            ? {
                title: taxon.name,
                url: taxon.bibliography.find(b => b.url)?.url || ''
              }
            : undefined
        }
      };
      
      return entity;
    });
  }

  /**
   * Convert POWO suggest results to our PlantSearchEntity format
   */
  private convertPOWOSuggestToEntities(
    scientificNames: string[],
    commonNames: string[],
    originalQuery: string, 
    normalizedQuery: string
  ): PlantSearchEntity[] {
    const entities: PlantSearchEntity[] = [];
    
    // Process scientific names
    scientificNames.forEach((name, index) => {
      const confidence = calculateSimilarity(normalizedQuery, name);
      const matchPosition = name.toLowerCase().indexOf(normalizedQuery);
      
      // Generate a simple hash-based ID since POWO suggest doesn't provide fqId
      const powoId = this.generateSimpleId(name);
      
      // Cache the plant name for later retrieval in getDetails
      POWO_PLANT_CACHE.set(powoId, name);
      console.log(`POWO: Cached plant name "${name}" with ID ${powoId}`);
      
      const entity: PlantSearchEntity = {
        matched_in: name,
        matched_in_type: 'entity_name',
        access_token: generateAccessToken(powoId, 'powo'),
        match_position: Math.max(0, matchPosition),
        match_length: originalQuery.length,
        entity_name: name,
        common_names: [], // Will be populated if we find matches
        synonyms: [], // Will be populated in getDetails
        thumbnail: undefined, // Suggest endpoint doesn't include images
        confidence: confidence,
        provider_source: 'powo',
        provider_id: name, // Store the actual plant name for later retrieval
        details: {
          characteristics: {
            taxonomic_status: 'accepted' // Assume accepted for scientific names
          },
          external_ids: {
            powo_id: powoId
          }
        }
      };
      
      entities.push(entity);
    });
    
    // Process common names (lower confidence)
    commonNames.forEach((name, index) => {
      // Skip if this common name is too generic or doesn't match well
      const confidence = calculateSimilarity(normalizedQuery, name) * 0.7; // Lower confidence for common names
      if (confidence < 0.3) return;
      
      const matchPosition = name.toLowerCase().indexOf(normalizedQuery);
      const powoId = this.generateSimpleId(name);
      
      // Cache the plant name for later retrieval in getDetails
      POWO_PLANT_CACHE.set(powoId, name);
      console.log(`POWO: Cached plant name "${name}" with ID ${powoId}`);
      
      const entity: PlantSearchEntity = {
        matched_in: name,
        matched_in_type: 'common_name',
        access_token: generateAccessToken(powoId, 'powo'),
        match_position: Math.max(0, matchPosition),
        match_length: originalQuery.length,
        entity_name: name,
        common_names: [name],
        synonyms: [],
        thumbnail: undefined,
        confidence: confidence,
        provider_source: 'powo',
        provider_id: name, // Store the actual plant name for later retrieval
        details: {
          characteristics: {},
          external_ids: {
            powo_id: powoId
          }
        }
      };
      
      entities.push(entity);
    });
    
    return entities;
  }
  
  /**
   * Convert POWO search results to our PlantSearchEntity format
   */
  private convertPOWOSearchToEntities(
    results: POWOResult[], 
    originalQuery: string, 
    normalizedQuery: string
  ): PlantSearchEntity[] {
    if (!results || !Array.isArray(results)) {
      return [];
    }
    
    return results.map((result, index) => {
      // Calculate confidence based on name similarity
      const confidence = calculateSimilarity(normalizedQuery, result.name);
      const matchPosition = result.name.toLowerCase().indexOf(normalizedQuery);
      
      // Extract POWO ID from fqId
      const powoId = this.extractPOWOId(result.fqId);
      
      // Extract taxonomy information
      const taxonomy = {
        kingdom: result.kingdom || 'Plantae',
        phylum: 'Tracheophyta', // Default for vascular plants
        class: 'Magnoliopsida', // Default, would need more detailed lookup
        order: 'Unknown',
        family: result.family || 'Unknown',
        genus: result.genus || 'Unknown',
        species: result.species || result.name
      };
      
      const entity: PlantSearchEntity = {
        matched_in: result.name,
        matched_in_type: 'entity_name',
        access_token: generateAccessToken(powoId, 'powo'),
        match_position: Math.max(0, matchPosition),
        match_length: originalQuery.length,
        entity_name: result.name,
        common_names: [], // Search results don't typically include common names
        synonyms: [], // Will be populated in getDetails if available
        thumbnail: result.images?.[0]?.file,
        confidence: confidence,
        provider_source: 'powo',
        provider_id: result.fqId,
        details: {
          taxonomy: taxonomy,
          characteristics: {
            rank: result.rank,
            taxonomic_status: result.accepted ? 'accepted' : 'synonym',
            authorship: result.author,
            canonical_name: result.name,
            basionym: result.basionym
          },
          images: result.images ? result.images.map(img => ({
            url: img.file || '',
            thumbnail: img.file,
            license: img.license,
            attribution: img.publisher
          })) : undefined,
          external_ids: {
            powo_id: powoId
          }
        }
      };
      
      return entity;
    });
  }
  
  /**
   * Generate a simple hash-based ID for plant names (used when fqId not available)
   */
  private generateSimpleId(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Extract numeric POWO ID from fqId (format: urn:lsid:ipni.org:names:123456-1)
   */
  private extractPOWOId(fqId: string): number {
    const match = fqId.match(/(\d+)(?:-\d+)?$/);
    return match ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * Get detailed information about a specific plant entity
   * Note: POWO suggest API has limitations - we return basic information
   */
  async getDetails(accessToken: string): Promise<PlantSearchEntity | null> {
    const { parseAccessToken } = await import('./utils');
    const tokenInfo = parseAccessToken(accessToken);
    
    if (!tokenInfo || tokenInfo.provider !== 'powo') {
      return null;
    }
    
    console.log(`POWO getting details for entity ID: ${tokenInfo.entityId}`);
    
    try {
      // Try to get comprehensive data using pykew client first
      const fqId = `urn:lsid:ipni.org:names:${tokenInfo.entityId}-1`;
      console.log(`POWO getDetails: Trying pykew lookup with fqId: ${fqId}`);
      
      const taxon = await this.powoClient.getComprehensiveData(fqId);
      if (taxon) {
        console.log(`POWO getDetails: Found comprehensive data for ${taxon.name}`);
        
        // Convert taxon to our format
        const entities = this.convertPOWOTaxaToEntities([taxon], taxon.name, normalizeQuery(taxon.name));
        if (entities.length > 0) {
          const entity = entities[0];
          entity.access_token = accessToken; // Preserve original access token
          return entity;
        }
      }
      
      console.log('POWO getDetails: pykew lookup failed, trying cache...');
      
      // Fallback to cache-based approach
      const plantName = POWO_PLANT_CACHE.get(tokenInfo.entityId);
      
      if (!plantName) {
        console.log('POWO getDetails: Plant name not found in cache');
        console.log('Current cache contents:', Array.from(POWO_PLANT_CACHE.entries()));
        console.log('Looking for entity ID:', tokenInfo.entityId);
        
        // As a fallback, try to create a minimal entity
        // This helps with graceful degradation when cache is empty
        const fallbackEntity: PlantSearchEntity = {
          matched_in: 'Unknown POWO Plant',
          matched_in_type: 'entity_name',
          access_token: accessToken,
          match_position: 0,
          match_length: 0,
          entity_name: 'Unknown POWO Plant',
          common_names: [],
          synonyms: [],
          thumbnail: undefined,
          confidence: 0.3,
          provider_source: 'powo',
          provider_id: `unknown-${tokenInfo.entityId}`,
          details: {
            characteristics: {
              taxonomic_status: 'unknown'
            },
            external_ids: {
              powo_id: tokenInfo.entityId
            }
          }
        };
        
        return fallbackEntity;
      }
      
      console.log(`POWO getDetails: Retrieved plant name from cache: ${plantName}`);
      
      // Create enhanced entity with the cached plant name
      const entity: PlantSearchEntity = {
        matched_in: plantName,
        matched_in_type: 'entity_name',
        access_token: accessToken,
        match_position: 0,
        match_length: plantName.length,
        entity_name: plantName,
        common_names: [],
        synonyms: [],
        thumbnail: undefined,
        confidence: 1.0,
        provider_source: 'powo',
        provider_id: plantName,
        details: {
          characteristics: {
            taxonomic_status: 'accepted', // Assume accepted from POWO
            canonical_name: plantName
          },
          external_ids: {
            powo_id: tokenInfo.entityId
          }
        }
      };
      
      return entity;
      
    } catch (error) {
      console.error('POWO getDetails error:', error);
      return null;
    }
  }
  
  /**
   * Get detailed taxon information by fqId (for plant detail endpoint)
   */
  async getTaxonDetails(fqId: string): Promise<POWOResult | null> {
    try {
      // POWO taxon lookup endpoint (inferred from pykew library)
      const url = `${this.baseUrl}/taxon/${encodeURIComponent(fqId)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Details)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`POWO taxon lookup failed: ${response.status}`);
        return null;
      }
      
      const data: POWOResult = await response.json();
      return data;
      
    } catch (error) {
      console.error('POWO taxon details error:', error);
      return null;
    }
  }
}