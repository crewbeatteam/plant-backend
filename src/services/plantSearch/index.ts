// Main factory and types
export { PlantSearchFactory } from './factory';
export type { 
  PlantSearchProviderType,
  PlantSearchConfig 
} from './factory';

// Core interfaces and types
export type {
  PlantSearchProvider,
  PlantSearchRequest,
  PlantSearchResult,
  PlantSearchEntity,
  PlantSearchFilters,
  PlantSearchProviderInfo,
  PlantSearchStats,
  ProviderRawResponse,
  FuzzySearchMatch,
  StoredPlantEntity,
  StoredSearchQuery
} from './interface';

// Individual providers
export { LocalPlantSearchProvider } from './localProvider';
export { PerenualPlantSearchProvider } from './perenualProvider';
export { GBIFPlantSearchProvider } from './gbifProvider';
export { iNaturalistPlantSearchProvider } from './inaturalistProvider';
export { MockPlantSearchProvider } from './mockProvider';

// Utilities
export { 
  PlantSearchDatabase,
  normalizeQuery,
  hashQuery,
  generateAccessToken,
  parseAccessToken,
  calculateSimilarity
} from './utils';

// Re-export for convenience
export { MOCK_PLANT_SPECIES } from '../plantIdentification';