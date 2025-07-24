/**
 * pykew-ts: TypeScript implementation of the pykew library
 * For accessing Kew's botanical databases including POWO (Plants of the World Online)
 * 
 * Based on the original Python pykew library:
 * https://github.com/RBGKew/pykew
 */

// Core functionality
export { ApiClient, SearchResult, POWO_URL, IPNI_URL, KPL_URL } from './core';
export type { RequestOptions, SearchQuery, SearchOptions } from './core';

// POWO client
export { POWOClient, createPOWOClient } from './powo';
export type {
  POWOTaxon,
  POWOImage,
  POWODistribution,
  POWOVernacularName,
  POWOSynonym,
  POWODescription,
  POWOBibliography,
  POWOSearchOptions,
} from './powo';

// Terms and query building
export {
  NameTerms,
  CharacteristicTerms,
  GeographyTerms,
  Filters,
  Include,
  Ranks,
  AllTerms,
  QueryBuilder,
} from './terms';
export type {
  NameTerm,
  CharacteristicTerm,
  GeographyTerm,
  Filter,
  IncludeOption,
  Rank,
  SearchTerm,
} from './terms';

// Convenience function (already exported above, so this is redundant)
// export function createClient(): POWOClient {
//   return createPOWOClient();
// }