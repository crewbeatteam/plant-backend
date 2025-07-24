/**
 * TypeScript implementation of pykew core functionality
 * Based on the original Python pykew library by RBG Kew
 * https://github.com/RBGKew/pykew
 */

// API Base URLs
export const IPNI_URL = 'https://beta.ipni.org/api/1';
export const POWO_URL = 'https://powo.science.kew.org/api/2';
export const KPL_URL = 'https://kewplantlist.org/api/v1';

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface SearchQuery {
  [key: string]: string | number | boolean | string[] | number[];
}

export interface SearchOptions {
  cursor?: string;
  size?: number;
  filters?: string[];
  include?: string[];
}

export class ApiClient {
  private baseUrl: string;
  private defaultOptions: RequestOptions;

  constructor(baseUrl: string, options: RequestOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultOptions = {
      timeout: 10000,
      retries: 3,
      retryDelay: 1000,
      headers: {
        'User-Agent': 'Plant.ID-API/1.0 (pykew-ts implementation)',
        'Accept': 'application/json',
      },
      ...options,
    };
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params: Record<string, any> = {}): string {
    const url = new URL(`${this.baseUrl}/${endpoint.replace(/^\//, '')}`);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, String(v)));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    });

    return url.toString();
  }

  /**
   * Make HTTP GET request with retry logic
   */
  async get(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = this.buildUrl(endpoint, params);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= (this.defaultOptions.retries || 3); attempt++) {
      try {
        console.log(`pykew-ts: Making request to ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.defaultOptions.headers,
          signal: this.defaultOptions.timeout 
            ? AbortSignal.timeout(this.defaultOptions.timeout)
            : undefined,
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited - wait and retry
            console.log(`pykew-ts: Rate limited, retrying in ${this.defaultOptions.retryDelay}ms`);
            await this.delay(this.defaultOptions.retryDelay || 1000);
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`pykew-ts: Request successful, received ${JSON.stringify(data).length} characters`);
        return data;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`pykew-ts: Request attempt ${attempt + 1} failed:`, lastError.message);
        
        if (attempt < (this.defaultOptions.retries || 3)) {
          await this.delay(this.defaultOptions.retryDelay || 1000);
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Delay helper for retry logic
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class SearchResult {
  private client: ApiClient;
  private endpoint: string;
  private query: SearchQuery;
  private options: SearchOptions;
  private cursor?: string;
  private totalResults?: number;
  private results: any[] = [];
  private exhausted = false;

  constructor(
    client: ApiClient,
    endpoint: string,
    query: SearchQuery,
    options: SearchOptions = {}
  ) {
    this.client = client;
    this.endpoint = endpoint;
    this.query = query;
    this.options = options;
    this.cursor = options.cursor;
  }

  /**
   * Execute search and return all results
   */
  async all(): Promise<any[]> {
    const results: any[] = [];
    
    for await (const item of this) {
      results.push(item);
    }
    
    return results;
  }

  /**
   * Get the first result
   */
  async first(): Promise<any | null> {
    for await (const item of this) {
      return item;
    }
    return null;
  }

  /**
   * Get specified number of results
   */
  async take(count: number): Promise<any[]> {
    const results: any[] = [];
    let taken = 0;
    
    for await (const item of this) {
      results.push(item);
      taken++;
      if (taken >= count) break;
    }
    
    return results;
  }

  /**
   * Iterator implementation for async iteration
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<any> {
    while (!this.exhausted) {
      await this.fetchNext();
      
      while (this.results.length > 0) {
        yield this.results.shift();
      }
    }
  }

  /**
   * Fetch next batch of results
   */
  private async fetchNext(): Promise<void> {
    if (this.exhausted) return;

    const params: Record<string, any> = { ...this.query };
    
    if (this.cursor) {
      params.cursor = this.cursor;
    }
    
    if (this.options.size) {
      params.perPage = this.options.size;
    }
    
    if (this.options.filters) {
      params.f = this.options.filters.join(',');
    }
    
    if (this.options.include) {
      params.include = this.options.include.join(',');
    }

    try {
      const response = await this.client.get(this.endpoint, params);
      
      // Handle different response formats
      if (response.results && Array.isArray(response.results)) {
        this.results.push(...response.results);
        this.cursor = response.cursor;
        this.totalResults = response.totalResults;
        
        // Check if we've reached the end
        if (!response.cursor || response.results.length === 0) {
          this.exhausted = true;
        }
      } else if (Array.isArray(response)) {
        this.results.push(...response);
        this.exhausted = true;
      } else {
        // Single result
        this.results.push(response);
        this.exhausted = true;
      }
      
    } catch (error) {
      console.error('pykew-ts: Search failed:', error);
      this.exhausted = true;
      throw error;
    }
  }

  /**
   * Get total number of results (if available)
   */
  getTotalResults(): number | undefined {
    return this.totalResults;
  }

  /**
   * Check if search is exhausted
   */
  isExhausted(): boolean {
    return this.exhausted;
  }
}