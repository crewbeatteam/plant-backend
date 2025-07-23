export interface PlantSearchRequest {
  query: string;
  limit?: number;
  language?: string;
  filters?: PlantSearchFilters;
  // Include location for providers that support it
  latitude?: number;
  longitude?: number;
}

export interface PlantSearchFilters {
  indoor?: boolean;
  outdoor?: boolean;
  edible?: boolean;
  poisonous?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  care_level?: 'low' | 'medium' | 'high';
  sunlight?: 'low' | 'medium' | 'high' | 'full';
  watering?: 'low' | 'medium' | 'high';
  cycle?: 'annual' | 'biennial' | 'perennial';
}

export interface PlantSearchEntity {
  matched_in: string;
  matched_in_type: 'entity_name' | 'common_name' | 'synonym';
  access_token: string;
  match_position: number;
  match_length: number;
  entity_name: string;
  common_names?: string[];
  synonyms?: string[];
  thumbnail?: string;
  confidence?: number;                    // Match confidence score (0-1)
  provider_source: string;               // Which provider found this
  provider_id?: string;                  // Provider's internal ID
  
  // Extended plant data
  details?: {
    taxonomy?: {
      kingdom: string;
      phylum: string;
      class: string;
      order: string;
      family: string;
      genus: string;
      species: string;
    };
    characteristics?: {
      indoor?: boolean;
      outdoor?: boolean;
      edible?: boolean;
      poisonous?: boolean;
      difficulty?: string;
      care_level?: string;
      sunlight?: string;
      watering?: string;
      cycle?: string;
      mature_height?: string;
      mature_width?: string;
    };
    external_ids?: {
      gbif_id?: number;
      inaturalist_id?: number;
      perenual_id?: number;
    };
    images?: Array<{
      url: string;
      thumbnail?: string;
      license?: string;
      attribution?: string;
    }>;
    wikipedia?: {
      title: string;
      url: string;
      extract?: string;
    };
  };
}

export interface PlantSearchResult {
  entities: PlantSearchEntity[];
  entities_trimmed: boolean;
  limit: number;
  provider: string;
  cached: boolean;                       // True if results came from local database
  search_time_ms: number;
  query_normalized: string;              // Normalized version of search query
  total_found?: number;                  // Total matches (if known)
}

export interface PlantSearchProvider {
  search(request: PlantSearchRequest): Promise<PlantSearchResult>;
  getName(): string;
  isAvailable(): Promise<boolean>;
  shouldCache(): boolean;                // Whether results should be stored permanently
  getProviderInfo(): PlantSearchProviderInfo;
}

export interface PlantSearchProviderInfo {
  name: string;
  description: string;
  capabilities: {
    fuzzy_search: boolean;
    filters: boolean;
    images: boolean;
    taxonomy: boolean;
    common_names: boolean;
    synonyms: boolean;
    location_based: boolean;
  };
  rate_limits?: {
    requests_per_minute?: number;
    requests_per_day?: number;
  };
  cost?: {
    free_tier?: number;
    cost_per_request?: number;
  };
}

export interface PlantSearchStats {
  provider_name: string;
  search_date: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_response_time_ms: number;
  avg_results_returned: number;
  success_rate: number;                  // Calculated: successful/total
}

// For storing provider responses before normalization
export interface ProviderRawResponse {
  provider: string;
  raw_data: any;                        // Original API response
  parsed_entities: PlantSearchEntity[];
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

// For fuzzy search scoring
export interface FuzzySearchMatch {
  entity_id: number;
  entity_name: string;
  matched_text: string;
  match_type: 'entity_name' | 'common_name' | 'synonym';
  similarity_score: number;             // 0-1, higher is better match
  exact_match: boolean;
}

// Database entity representation
export interface StoredPlantEntity {
  id: number;
  entity_name: string;
  common_names?: string[];             // Parsed from JSON
  synonyms?: string[];                 // Parsed from JSON
  provider_source: string;
  provider_id?: string;
  provider_data?: any;                 // Full provider response data
  taxonomy_data?: any;
  characteristics_data?: any;
  image_urls?: string[];
  thumbnail_url?: string;
  wikipedia_url?: string;
  gbif_id?: number;
  inaturalist_id?: number;
  created_at: string;
  updated_at: string;
}

export interface StoredSearchQuery {
  id: number;
  query_original: string;
  query_normalized: string;
  query_hash: string;
  search_count: number;
  last_searched_at: string;
  created_at: string;
}