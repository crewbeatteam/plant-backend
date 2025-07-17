export interface ImageIdentificationRequest {
  images: string[]; // R2 URLs
  files?: File[]; // Original files for providers that need them
  latitude?: number;
  longitude?: number;
  classification_level?: 'all' | 'genus' | 'species' | 'infraspecies';
  similar_images?: boolean;
  language?: string;
}

export interface PlantSuggestion {
  id: number;
  name: string;
  scientific_name: string;
  probability: number;
  common_names?: string[];
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
    gbif_id?: number;
    inaturalist_id?: number;
    wikipedia?: {
      title: string;
      url: string;
      image?: string;
    };
    similar_images?: Array<{
      id: string;
      url: string;
      license_name?: string;
      license_url?: string;
      citation?: string;
    }>;
  };
}

export interface ImageIdentificationResult {
  is_plant: {
    probability: number;
    threshold: number;
    binary: boolean;
  };
  classification: {
    suggestions: PlantSuggestion[];
  };
  processing_time_ms: number;
  provider: string;
}

export interface ImageIdentifier {
  identify(request: ImageIdentificationRequest): Promise<ImageIdentificationResult>;
  getName(): string;
  isAvailable(): Promise<boolean>;
}
