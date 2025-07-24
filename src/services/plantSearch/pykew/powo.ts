/**
 * POWO (Plants of the World Online) client
 * TypeScript implementation based on pykew
 */

import { ApiClient, SearchResult, POWO_URL, SearchQuery, SearchOptions } from './core';
import { Filters, Include, QueryBuilder, Filter, IncludeOption } from './terms';

export interface POWOTaxon {
  fqId: string;
  name: string;
  authors?: string;
  basionym?: string;
  rank?: string;
  kingdom?: string;
  family?: string;
  genus?: string;
  species?: string;
  accepted?: boolean;
  synonymOf?: {
    fqId: string;
    name: string;
    authors?: string;
  };
  taxonomicStatus?: string;
  nomenclaturalStatus?: string;
  publishedIn?: string;
  publicationYear?: number;
  nameType?: string;
  images?: POWOImage[];
  distribution?: POWODistribution;
  vernacularNames?: POWOVernacularName[];
  synonyms?: POWOSynonym[];
  descriptions?: POWODescription[];
  bibliography?: POWOBibliography[];
}

export interface POWOImage {
  url: string;
  caption?: string;
  publisher?: string;
  license?: string;
  licenseUrl?: string;
  thumbnailUrl?: string;
}

export interface POWODistribution {
  natives?: string[];
  introduced?: string[];
  extinct?: string[];
  doubtful?: string[];
  summary?: string;
}

export interface POWOVernacularName {
  name: string;
  language?: string;
  locality?: string;
  country?: string;
  source?: string;
}

export interface POWOSynonym {
  fqId: string;
  name: string;
  authors?: string;
  type?: string;
}

export interface POWODescription {
  type: string;
  text: string;
  source?: string;
}

export interface POWOBibliography {
  title: string;
  authors?: string;
  year?: number;
  publication?: string;
  doi?: string;
  url?: string;
}

export interface POWOSearchOptions extends SearchOptions {
  filters?: Filter[];
  include?: IncludeOption[];
  rank?: string;
}

export class POWOClient {
  private client: ApiClient;

  constructor() {
    this.client = new ApiClient(POWO_URL, {
      headers: {
        'User-Agent': 'Plant.ID-API/1.0 (pykew-ts POWO client)',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Search POWO for taxa
   */
  search(query: string | SearchQuery, options: POWOSearchOptions = {}): SearchResult {
    let searchQuery: SearchQuery;
    
    if (typeof query === 'string') {
      // Simple string query - search across multiple fields
      searchQuery = { q: query };
    } else {
      searchQuery = query;
    }

    return new SearchResult(this.client, 'search', searchQuery, options);
  }

  /**
   * Lookup a specific taxon by ID
   */
  async lookup(fqId: string, include: IncludeOption[] = []): Promise<POWOTaxon | null> {
    try {
      const params: Record<string, any> = {};
      
      if (include.length > 0) {
        params.include = include.join(',');
      }

      const result = await this.client.get(`taxon/${encodeURIComponent(fqId)}`, params);
      return this.normalizeTaxon(result);
    } catch (error) {
      console.error(`POWO lookup failed for ${fqId}:`, error);
      return null;
    }
  }

  /**
   * Search by name with automatic query building
   */
  searchByName(name: string, options: POWOSearchOptions = {}): SearchResult {
    const query = new QueryBuilder().name(name).build();
    return this.search(query, options);
  }

  /**
   * Search by genus
   */
  searchByGenus(genus: string, options: POWOSearchOptions = {}): SearchResult {
    const query = new QueryBuilder().genus(genus).build();
    return this.search(query, options);
  }

  /**
   * Search by family
   */
  searchByFamily(family: string, options: POWOSearchOptions = {}): SearchResult {
    const query = new QueryBuilder().family(family).build();
    return this.search(query, options);
  }

  /**
   * Search for accepted names only
   */
  searchAccepted(query: string | SearchQuery, options: POWOSearchOptions = {}): SearchResult {
    const searchOptions = {
      ...options,
      filters: [...(options.filters || []), Filters.ACCEPTED_NAMES],
    };
    return this.search(query, searchOptions);
  }

  /**
   * Search with images only
   */
  searchWithImages(query: string | SearchQuery, options: POWOSearchOptions = {}): SearchResult {
    const searchOptions = {
      ...options,
      filters: [...(options.filters || []), Filters.HAS_IMAGES],
    };
    return this.search(query, searchOptions);
  }

  /**
   * Get comprehensive data for a taxon
   */
  async getComprehensiveData(fqId: string): Promise<POWOTaxon | null> {
    return this.lookup(fqId, [
      Include.DISTRIBUTION,
      Include.VERNACULAR_NAMES,
      Include.SYNONYMS,
      Include.IMAGES,
      Include.DESCRIPTIONS,
      Include.BIBLIOGRAPHY,
    ]);
  }

  /**
   * Search with comprehensive includes
   */
  searchComprehensive(query: string | SearchQuery, options: POWOSearchOptions = {}): SearchResult {
    const searchOptions = {
      ...options,
      include: [
        Include.DISTRIBUTION,
        Include.VERNACULAR_NAMES,
        Include.IMAGES,
        ...(options.include || []),
      ],
    };
    return this.search(query, searchOptions);
  }

  /**
   * Normalize API response to POWOTaxon format
   */
  private normalizeTaxon(data: any): POWOTaxon {
    return {
      fqId: data.fqId || data.id,
      name: data.name,
      authors: data.authors,
      basionym: data.basionym,
      rank: data.rank,
      kingdom: data.kingdom,
      family: data.family,
      genus: data.genus,
      species: data.species,
      accepted: data.accepted,
      synonymOf: data.synonymOf,
      taxonomicStatus: data.taxonomicStatus,
      nomenclaturalStatus: data.nomenclaturalStatus,
      publishedIn: data.publishedIn,
      publicationYear: data.publicationYear,
      nameType: data.nameType,
      images: this.normalizeImages(data.images),
      distribution: this.normalizeDistribution(data.distribution),
      vernacularNames: this.normalizeVernacularNames(data.vernacularNames),
      synonyms: this.normalizeSynonyms(data.synonyms),
      descriptions: this.normalizeDescriptions(data.descriptions),
      bibliography: this.normalizeBibliography(data.bibliography),
    };
  }

  private normalizeImages(images: any[]): POWOImage[] | undefined {
    if (!Array.isArray(images)) return undefined;
    
    return images.map(img => ({
      url: img.url || img.original,
      caption: img.caption,
      publisher: img.publisher,
      license: img.license,
      licenseUrl: img.licenseUrl,
      thumbnailUrl: img.thumbnail || img.thumbnailUrl,
    }));
  }

  private normalizeDistribution(dist: any): POWODistribution | undefined {
    if (!dist) return undefined;
    
    return {
      natives: dist.natives || dist.native,
      introduced: dist.introduced || dist.introduction,
      extinct: dist.extinct,
      doubtful: dist.doubtful,
      summary: dist.summary,
    };
  }

  private normalizeVernacularNames(names: any[]): POWOVernacularName[] | undefined {
    if (!Array.isArray(names)) return undefined;
    
    return names.map(name => ({
      name: name.name || name.vernacularName,
      language: name.language,
      locality: name.locality,
      country: name.country,
      source: name.source,
    }));
  }

  private normalizeSynonyms(synonyms: any[]): POWOSynonym[] | undefined {
    if (!Array.isArray(synonyms)) return undefined;
    
    return synonyms.map(syn => ({
      fqId: syn.fqId || syn.id,
      name: syn.name,
      authors: syn.authors,
      type: syn.type,
    }));
  }

  private normalizeDescriptions(descriptions: any[]): POWODescription[] | undefined {
    if (!Array.isArray(descriptions)) return undefined;
    
    return descriptions.map(desc => ({
      type: desc.type,
      text: desc.text || desc.description,
      source: desc.source,
    }));
  }

  private normalizeBibliography(bibliography: any[]): POWOBibliography[] | undefined {
    if (!Array.isArray(bibliography)) return undefined;
    
    return bibliography.map(bib => ({
      title: bib.title,
      authors: bib.authors,
      year: bib.year,
      publication: bib.publication,
      doi: bib.doi,
      url: bib.url,
    }));
  }
}

// Export convenience function for creating client
export function createPOWOClient(): POWOClient {
  return new POWOClient();
}