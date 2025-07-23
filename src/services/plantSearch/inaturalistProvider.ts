import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { normalizeQuery, generateAccessToken, calculateSimilarity } from './utils';

// iNaturalist API response types
interface iNaturalistTaxaResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: iNaturalistTaxon[];
}

interface iNaturalistTaxon {
  id: number;
  name: string;
  rank: string;
  rank_level: number;
  ancestor_ids: number[];
  is_active: boolean;
  ancestry: string;
  iconic_taxon_id: number;
  conservation_status: any;
  conservation_statuses: any[];
  wikipedia_url: string | null;
  default_photo: {
    id: number;
    license_code: string;
    attribution: string;
    url: string;
    original_url: string;
    large_url: string;
    medium_url: string;
    small_url: string;
    square_url: string;
  } | null;
  taxon_photos: Array<{
    taxon: any;
    photo: {
      id: number;
      license_code: string;
      attribution: string;
      url: string;
      original_url: string;
      large_url: string;
      medium_url: string;
      small_url: string;
      square_url: string;
    };
  }>;
  preferred_common_name: string | null;
  english_common_name: string | null;
  matched_term: string;
  observations_count: number;
  atlas_id: number | null;
  complete_species_count: number | null;
  parent: {
    id: number;
    name: string;
    rank: string;
    rank_level: number;
  } | null;
  children: any[];
  ancestors: Array<{
    id: number;
    name: string;
    rank: string;
    rank_level: number;
  }>;
  establishment_means: any;
}

export class iNaturalistPlantSearchProvider implements PlantSearchProvider {
  private baseUrl = 'https://api.inaturalist.org/v1';
  private plantTaxonId = 47126; // iNaturalist taxon ID for Plantae (plants)
  
  constructor() {
    // iNaturalist doesn't require API key for basic operations
  }
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = Math.min(request.limit || 10, 100);
    
    try {
      const searchParams = new URLSearchParams({
        q: request.query,
        per_page: limit.toString(),
        page: '1',
        taxon_id: this.plantTaxonId.toString(), // Only plants
        rank: 'species,genus', // Focus on species and genus level
        is_active: 'true', // Only active taxa
        order: 'desc',
        order_by: 'observations_count', // Order by popularity/observations
      });
      
      // Add language preference if specified
      if (request.language && request.language !== 'en') {
        searchParams.append('locale', request.language);
      }
      
      const url = `${this.baseUrl}/taxa?${searchParams.toString()}`;
      console.log(`iNaturalist API request: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Plant Search Service)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`iNaturalist API error: ${response.status} ${response.statusText}`);
      }
      
      const data: iNaturalistTaxaResponse = await response.json();
      const searchTime = Date.now() - startTime;
      
      console.log(`iNaturalist API returned ${data.results?.length || 0} raw results:`, {
        total_results: data.total_results,
        page: data.page,
        per_page: data.per_page,
        first_items: data.results?.slice(0, 2)
      });
      
      // Convert iNaturalist taxa to our format
      const entities = await this.convertiNaturalistToEntities(data.results || [], request.query, normalizedQuery);
      
      // Sort by relevance and observation count
      const sortedEntities = entities
        .sort((a, b) => {
          // First by confidence, then by observation count if available
          const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);
          if (confidenceDiff !== 0) return confidenceDiff;
          
          // If confidence is equal, prefer taxa with more observations
          const aObservations = a.details?.observations_count || 0;
          const bObservations = b.details?.observations_count || 0;
          return bObservations - aObservations;
        })
        .slice(0, limit);
      
      return {
        entities: sortedEntities,
        entities_trimmed: data.results.length >= limit && data.total_results > limit,
        limit: limit,
        provider: 'inaturalist',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: data.total_results
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      console.error('iNaturalist search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'inaturalist',
        cached: false,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'iNaturalist Biodiversity Database';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability with a simple query
      const testUrl = `${this.baseUrl}/taxa?q=Quercus&per_page=1`;
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Availability Check)',
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('iNaturalist availability check failed:', error);
      return false;
    }
  }
  
  shouldCache(): boolean {
    return true; // External provider results should be cached
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'iNaturalist Biodiversity Database',
      description: 'Community-driven biodiversity database with millions of plant observations and photos',
      capabilities: {
        fuzzy_search: true,
        filters: false, // iNaturalist has limited filtering in basic API
        images: true, // Excellent photo coverage
        taxonomy: true, // Good taxonomic data
        common_names: true, // Multi-language common names
        synonyms: false, // Limited synonym support
        location_based: true // Strong geographic data
      },
      rate_limits: {
        requests_per_minute: 60, // iNaturalist rate limit
        requests_per_day: 10000
      },
      cost: {
        free_tier: -1, // Completely free
        cost_per_request: 0
      }
    };
  }
  
  /**
   * Convert iNaturalist taxa data to our PlantSearchEntity format
   */
  private async convertiNaturalistToEntities(
    taxa: iNaturalistTaxon[], 
    originalQuery: string, 
    normalizedQuery: string
  ): Promise<PlantSearchEntity[]> {
    const entities: PlantSearchEntity[] = [];
    
    for (let i = 0; i < taxa.length; i++) {
      const taxon = taxa[i];
      
      // Skip if not a plant (double-check)
      if (!this.isPlantTaxon(taxon)) {
        continue;
      }
      
      // Determine what matched and calculate confidence
      const { matchedIn, matchedInType, matchPosition, confidence } = this.findBestMatch(
        taxon, 
        originalQuery, 
        normalizedQuery
      );
      
      // Get common names
      const commonNames: string[] = [];
      if (taxon.preferred_common_name) {
        commonNames.push(taxon.preferred_common_name);
      }
      if (taxon.english_common_name && taxon.english_common_name !== taxon.preferred_common_name) {
        commonNames.push(taxon.english_common_name);
      }
      
      // Get taxonomy information from ancestors
      const taxonomy = this.extractTaxonomy(taxon);
      
      // Get the best photo
      const thumbnail = taxon.default_photo?.medium_url || undefined;
      const images = this.extractImages(taxon);
      
      const entity: PlantSearchEntity = {
        matched_in: matchedIn,
        matched_in_type: matchedInType,
        access_token: generateAccessToken(taxon.id, 'inaturalist'),
        match_position: matchPosition,
        match_length: originalQuery.length,
        entity_name: taxon.name,
        common_names: [...new Set(commonNames)].filter(Boolean),
        synonyms: [], // iNaturalist doesn't provide synonyms in basic search
        thumbnail: thumbnail,
        confidence: confidence,
        provider_source: 'inaturalist',
        provider_id: taxon.id.toString(),
        details: {
          taxonomy: taxonomy,
          observations_count: taxon.observations_count,
          wikipedia: taxon.wikipedia_url ? {
            title: taxon.name,
            url: taxon.wikipedia_url
          } : undefined,
          images: images,
          external_ids: {
            inaturalist_id: taxon.id
          },
          characteristics: {
            rank: taxon.rank,
            rank_level: taxon.rank_level,
            is_active: taxon.is_active
          }
        }
      };
      
      entities.push(entity);
    }
    
    return entities;
  }
  
  /**
   * Check if a taxon is a plant
   */
  private isPlantTaxon(taxon: iNaturalistTaxon): boolean {
    // Check if it's under the Plantae kingdom (taxon ID 47126)
    return taxon.ancestor_ids.includes(this.plantTaxonId) || taxon.id === this.plantTaxonId;
  }
  
  /**
   * Find the best match in the iNaturalist taxon data
   */
  private findBestMatch(
    taxon: iNaturalistTaxon, 
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
    if (taxon.name) {
      const confidence = calculateSimilarity(normalizedQuery, taxon.name);
      const position = taxon.name.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: taxon.name,
        type: 'entity_name',
        confidence: confidence,
        position: Math.max(0, position)
      });
    }
    
    // Check matched term (what iNaturalist actually matched)
    if (taxon.matched_term && taxon.matched_term !== taxon.name) {
      const confidence = calculateSimilarity(normalizedQuery, taxon.matched_term);
      const position = taxon.matched_term.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: taxon.matched_term,
        type: 'entity_name',
        confidence: confidence + 0.1, // Boost since it's what was matched
        position: Math.max(0, position)
      });
    }
    
    // Check preferred common name
    if (taxon.preferred_common_name) {
      const confidence = calculateSimilarity(normalizedQuery, taxon.preferred_common_name);
      const position = taxon.preferred_common_name.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: taxon.preferred_common_name,
        type: 'common_name',
        confidence: confidence,
        position: Math.max(0, position)
      });
    }
    
    // Check English common name
    if (taxon.english_common_name && taxon.english_common_name !== taxon.preferred_common_name) {
      const confidence = calculateSimilarity(normalizedQuery, taxon.english_common_name);
      const position = taxon.english_common_name.toLowerCase().indexOf(normalizedQuery);
      matches.push({
        text: taxon.english_common_name,
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
      matchedIn: taxon.matched_term || taxon.name || 'Unknown Species',
      matchedInType: 'entity_name',
      matchPosition: 0,
      confidence: 0.1
    };
  }
  
  /**
   * Extract taxonomy information from iNaturalist taxon
   */
  private extractTaxonomy(taxon: iNaturalistTaxon) {
    const taxonomy: any = {
      kingdom: 'Plantae', // We know it's a plant
      phylum: 'Unknown',
      class: 'Unknown',
      order: 'Unknown',
      family: 'Unknown',
      genus: 'Unknown',
      species: taxon.name
    };
    
    // Extract taxonomy from ancestors
    for (const ancestor of taxon.ancestors || []) {
      switch (ancestor.rank) {
        case 'kingdom':
          taxonomy.kingdom = ancestor.name;
          break;
        case 'phylum':
          taxonomy.phylum = ancestor.name;
          break;
        case 'class':
          taxonomy.class = ancestor.name;
          break;
        case 'order':
          taxonomy.order = ancestor.name;
          break;
        case 'family':
          taxonomy.family = ancestor.name;
          break;
        case 'genus':
          taxonomy.genus = ancestor.name;
          break;
      }
    }
    
    // If this taxon is genus level, use it as genus
    if (taxon.rank === 'genus') {
      taxonomy.genus = taxon.name;
    }
    
    return taxonomy;
  }
  
  /**
   * Extract images from iNaturalist taxon
   */
  private extractImages(taxon: iNaturalistTaxon) {
    const images: Array<{ url: string; attribution?: string; license?: string }> = [];
    
    // Add default photo
    if (taxon.default_photo) {
      images.push({
        url: taxon.default_photo.large_url || taxon.default_photo.url,
        attribution: taxon.default_photo.attribution,
        license: taxon.default_photo.license_code
      });
    }
    
    // Add additional taxon photos (up to 5 total)
    for (const taxonPhoto of (taxon.taxon_photos || []).slice(0, 4)) {
      if (taxonPhoto.photo && taxonPhoto.photo.id !== taxon.default_photo?.id) {
        images.push({
          url: taxonPhoto.photo.large_url || taxonPhoto.photo.url,
          attribution: taxonPhoto.photo.attribution,
          license: taxonPhoto.photo.license_code
        });
      }
    }
    
    return images.length > 0 ? images : undefined;
  }
  
  /**
   * Get taxon details by iNaturalist ID
   */
  async getTaxonDetails(inaturalistId: string): Promise<iNaturalistTaxon | null> {
    try {
      const url = `${this.baseUrl}/taxa/${inaturalistId}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plant.ID-API/1.0 (Taxon Details)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`iNaturalist details API error: ${response.status}`);
      }
      
      const data: { results: iNaturalistTaxon[] } = await response.json();
      return data.results?.[0] || null;
      
    } catch (error) {
      console.error('iNaturalist taxon details error:', error);
      return null;
    }
  }
}