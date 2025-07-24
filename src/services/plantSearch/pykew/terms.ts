/**
 * POWO API terms and parameters
 * Based on the original Python pykew library terms
 */

// Name-related search terms
export const NameTerms = {
  FULL_NAME: 'full_name',
  COMMON_NAME: 'common_name',
  KINGDOM: 'kingdom',
  FAMILY: 'family',
  GENUS: 'genus',
  SPECIES: 'species',
  AUTHOR: 'author',
} as const;

// Characteristic search terms
export const CharacteristicTerms = {
  SUMMARY: 'summary',
  APPEARANCE: 'appearance',
  CHARACTERISTIC: 'characteristic',
  FLOWER: 'flower',
  FRUIT: 'fruit',
  LEAF: 'leaf',
  INFLORESCENCE: 'inflorescence',
  SEED: 'seed',
  CLONING: 'cloning',
  USE: 'use',
} as const;

// Geography search terms
export const GeographyTerms = {
  DISTRIBUTION: 'distribution',
} as const;

// Available filters
export const Filters = {
  ACCEPTED_NAMES: 'accepted_names',
  HAS_IMAGES: 'has_images',
  FAMILIES: 'families',
  GENERA: 'genera',
  SPECIES: 'species',
  INFRASPECIES: 'infraspecies',
} as const;

// Include options for detailed data
export const Include = {
  DISTRIBUTION: 'distribution',
  VERNACULAR_NAMES: 'vernacular_names',
  SYNONYMS: 'synonyms',
  IMAGES: 'images',
  DESCRIPTIONS: 'descriptions',
  BIBLIOGRAPHY: 'bibliography',
} as const;

// Rank options
export const Ranks = {
  KINGDOM: 'kingdom',
  PHYLUM: 'phylum',
  CLASS: 'class',
  ORDER: 'order',
  FAMILY: 'family',
  GENUS: 'genus',
  SPECIES: 'species',
  SUBSPECIES: 'subspecies',
  VARIETY: 'variety',
  FORM: 'form',
} as const;

// Type definitions for better TypeScript support
export type NameTerm = typeof NameTerms[keyof typeof NameTerms];
export type CharacteristicTerm = typeof CharacteristicTerms[keyof typeof CharacteristicTerms];
export type GeographyTerm = typeof GeographyTerms[keyof typeof GeographyTerms];
export type Filter = typeof Filters[keyof typeof Filters];
export type IncludeOption = typeof Include[keyof typeof Include];
export type Rank = typeof Ranks[keyof typeof Ranks];

// Combined search terms
export const AllTerms = {
  ...NameTerms,
  ...CharacteristicTerms,
  ...GeographyTerms,
} as const;

export type SearchTerm = typeof AllTerms[keyof typeof AllTerms];

// Helper functions for building queries
export class QueryBuilder {
  private query: Record<string, any> = {};

  /**
   * Add a search term with value
   */
  term(term: SearchTerm, value: string | string[]): QueryBuilder {
    this.query[term] = value;
    return this;
  }

  /**
   * Add name-based search
   */
  name(value: string): QueryBuilder {
    return this.term(NameTerms.FULL_NAME, value);
  }

  /**
   * Add common name search
   */
  commonName(value: string): QueryBuilder {
    return this.term(NameTerms.COMMON_NAME, value);
  }

  /**
   * Add genus search
   */
  genus(value: string): QueryBuilder {
    return this.term(NameTerms.GENUS, value);
  }

  /**
   * Add species search
   */
  species(value: string): QueryBuilder {
    return this.term(NameTerms.SPECIES, value);
  }

  /**
   * Add family search
   */
  family(value: string): QueryBuilder {
    return this.term(NameTerms.FAMILY, value);
  }

  /**
   * Add distribution search
   */
  distribution(value: string | string[]): QueryBuilder {
    return this.term(GeographyTerms.DISTRIBUTION, value);
  }

  /**
   * Build the final query object
   */
  build(): Record<string, any> {
    return { ...this.query };
  }

  /**
   * Reset the query builder
   */
  reset(): QueryBuilder {
    this.query = {};
    return this;
  }
}