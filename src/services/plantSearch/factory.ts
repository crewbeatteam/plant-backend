import type { PlantSearchProvider, PlantSearchRequest, PlantSearchResult, PlantSearchEntity } from "./interface";
import { LocalPlantSearchProvider } from "./localProvider";
import { PerenualPlantSearchProvider } from "./perenualProvider";
import { GBIFPlantSearchProvider } from "./gbifProvider";
import { iNaturalistPlantSearchProvider } from "./inaturalistProvider";
import { PlantSearchDatabase } from "./utils";

export type PlantSearchProviderType = "local" | "perenual" | "gbif" | "inaturalist" | "openai" | "mock";

export interface PlantSearchConfig {
  perenual?: {
    apiKey: string;
  };
  openai?: {
    apiKey: string;
  };
  default?: PlantSearchProviderType;
  degradation?: PlantSearchProviderType[];
}

export class PlantSearchFactory {
  private config: PlantSearchConfig;
  private database: D1Database;
  private localProvider: LocalPlantSearchProvider;
  
  constructor(config: PlantSearchConfig, database: D1Database) {
    this.config = config;
    this.database = database;
    this.localProvider = new LocalPlantSearchProvider(database);
  }
  
  async createProvider(type?: PlantSearchProviderType): Promise<PlantSearchProvider> {
    const providerType = type || this.config.default || "perenual";
    
    switch (providerType) {
      case "local":
        return this.localProvider;
        
      case "perenual":
        console.log("Creating Perenual provider, API key configured:", !!this.config.perenual?.apiKey);
        if (!this.config.perenual?.apiKey) {
          throw new Error("Perenual API key not configured");
        }
        return new PerenualPlantSearchProvider(this.config.perenual.apiKey);
        
      case "gbif":
        return new GBIFPlantSearchProvider();
        
      case "inaturalist":
        return new iNaturalistPlantSearchProvider();
        
      case "openai":
        if (!this.config.openai?.apiKey) {
          throw new Error("OpenAI API key not configured");
        }
        // TODO: Implement OpenAI provider
        throw new Error("OpenAI provider not yet implemented");
        
      case "mock":
      default:
        // Import existing mock implementation
        const { MockPlantSearchProvider } = await import("./mockProvider");
        return new MockPlantSearchProvider();
    }
  }
  
  /**
   * Search with graceful degradation through multiple providers
   */
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const db = new PlantSearchDatabase(this.database);
    
    console.log("=== PLANT SEARCH FACTORY START ===");
    console.log("Request:", JSON.stringify(request, null, 2));
    console.log("Factory config:", {
      default: this.config.default,
      degradation: this.config.degradation,
      perenual_configured: !!this.config.perenual?.apiKey,
      openai_configured: !!this.config.openai?.apiKey
    });
    
    // Always try local provider first
    console.log("Trying local provider first...");
    const localResult = await this.tryProvider(this.localProvider, request);
    
    // If local provider has results, return them immediately
    if (localResult && localResult.entities.length > 0) {
      console.log(`Local provider returned ${localResult.entities.length} results`);
      return localResult;
    }
    
    // If no local results, try external providers with graceful degradation
    const providersToTry = [
      this.config.default || "perenual",
      ...(this.config.degradation || ["gbif", "mock"])
    ].filter(Boolean) as PlantSearchProviderType[];
    
    console.log(`Local provider had no results, trying external providers: ${providersToTry.join(", ")}`);
    
    for (const providerType of providersToTry) {
      // Skip local since we already tried it
      if (providerType === "local") continue;
      
      try {
        console.log(`Trying ${providerType} provider...`);
        const startTime = Date.now();
        
        console.log(`Creating ${providerType} provider instance...`);
        const provider = await this.createProvider(providerType);
        console.log(`Provider ${providerType} created successfully, checking availability...`);
        const isAvailable = await provider.isAvailable();
        
        if (!isAvailable) {
          console.log(`${providerType} provider is not available, skipping...`);
          await db.recordProviderStats(providerType, false, Date.now() - startTime, 0);
          continue;
        }
        
        const result = await this.tryProvider(provider, request);
        
        if (result && result.entities.length > 0) {
          console.log(`${providerType} provider returned ${result.entities.length} results`);
          
          // Record successful stats
          await db.recordProviderStats(
            providerType, 
            true, 
            result.search_time_ms, 
            result.entities.length
          );
          
          // Store results in local database for future searches
          if (provider.shouldCache()) {
            try {
              await this.localProvider.storeExternalResults(request.query, result);
              console.log(`Stored ${result.entities.length} results from ${providerType} in local database`);
            } catch (error) {
              console.warn(`Failed to store results from ${providerType}:`, error);
              // Don't fail the search if caching fails
            }
          }
          
          return result;
        } else {
          console.log(`${providerType} provider returned no results`);
          await db.recordProviderStats(providerType, true, result?.search_time_ms || 0, 0);
        }
        
      } catch (error) {
        console.error(`${providerType} provider failed:`, error);
        await db.recordProviderStats(providerType, false, 0, 0);
        // Continue to next provider (graceful degradation)
      }
    }
    
    // If all providers failed or returned no results, return empty result
    console.log("All providers exhausted, returning empty results");
    return {
      entities: [],
      entities_trimmed: false,
      limit: request.limit || 10,
      provider: 'none',
      cached: false,
      search_time_ms: 0,
      query_normalized: request.query.toLowerCase().trim(),
      total_found: 0
    };
  }
  
  /**
   * Try a provider and handle errors gracefully
   */
  private async tryProvider(
    provider: PlantSearchProvider, 
    request: PlantSearchRequest
  ): Promise<PlantSearchResult | null> {
    try {
      console.log(`Executing search with provider: ${provider.getName()}`);
      const result = await provider.search(request);
      console.log(`Provider ${provider.getName()} returned:`, {
        entities_count: result.entities.length,
        provider: result.provider,
        search_time: result.search_time_ms
      });
      return result;
    } catch (error) {
      console.error(`Provider ${provider.getName()} failed:`, error);
      return null;
    }
  }
  
  /**
   * Get provider information for all configured providers
   */
  async getProviderInfo(): Promise<Array<{
    type: PlantSearchProviderType;
    name: string;
    available: boolean;
    info: any;
  }>> {
    const providersToCheck: PlantSearchProviderType[] = [
      "local",
      this.config.default || "perenual",
      ...(this.config.degradation || ["gbif"])
    ].filter(Boolean) as PlantSearchProviderType[];
    
    const providerInfo = [];
    
    for (const type of [...new Set(providersToCheck)]) {
      try {
        const provider = await this.createProvider(type);
        const available = await provider.isAvailable();
        const info = provider.getProviderInfo();
        
        providerInfo.push({
          type,
          name: provider.getName(),
          available,
          info
        });
      } catch (error) {
        providerInfo.push({
          type,
          name: `${type} (Error)`,
          available: false,
          info: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }
    
    return providerInfo;
  }
  
  /**
   * Get provider statistics
   */
  async getProviderStats(days: number = 7): Promise<any> {
    const db = new PlantSearchDatabase(this.database);
    return await db.getProviderStats(undefined, days);
  }
  
  /**
   * Create factory from environment variables
   */
  static fromEnvironment(env: any, database: D1Database): PlantSearchFactory {
    return new PlantSearchFactory({
      perenual: env.PERENUAL_API_KEY
        ? { apiKey: env.PERENUAL_API_KEY }
        : undefined,
      openai: env.OPENAI_API_KEY
        ? { apiKey: env.OPENAI_API_KEY }
        : undefined,
      default: (env.DEFAULT_PLANT_SEARCH_PROVIDER as PlantSearchProviderType) || "perenual",
      degradation: env.PLANT_SEARCH_DEGRADATION_PROVIDERS
        ? (env.PLANT_SEARCH_DEGRADATION_PROVIDERS.split(",") as PlantSearchProviderType[])
        : ["gbif", "mock"]
    }, database);
  }
  
  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check if default provider is properly configured
    const defaultProvider = this.config.default || "perenual";
    if (defaultProvider === "perenual" && !this.config.perenual?.apiKey) {
      errors.push("Perenual API key is required when using perenual as default provider");
    }
    if (defaultProvider === "openai" && !this.config.openai?.apiKey) {
      errors.push("OpenAI API key is required when using openai as default provider");
    }
    
    // Check degradation providers
    if (this.config.degradation) {
      for (const provider of this.config.degradation) {
        if (provider === "perenual" && !this.config.perenual?.apiKey) {
          errors.push("Perenual API key is required for degradation provider");
        }
        if (provider === "openai" && !this.config.openai?.apiKey) {
          errors.push("OpenAI API key is required for degradation provider");
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get plant details by access token with graceful degradation
   */
  async getDetails(accessToken: string): Promise<PlantSearchEntity | null> {
    console.log("=== PLANT DETAILS RETRIEVAL START ===");
    console.log("Access token:", accessToken);
    
    // Parse the access token to get entity info
    const { parseAccessToken } = await import("./utils");
    const tokenInfo = parseAccessToken(accessToken);
    
    if (!tokenInfo) {
      console.log("Invalid access token format");
      return null;
    }
    
    console.log("Token info:", tokenInfo);
    
    // TODO: Temporarily disable local provider for plant details retrieval
    // First try to get from local database
    // console.log("Trying local provider first...");
    // const localResult = await this.tryProviderDetails(this.localProvider, accessToken);
    // 
    // if (localResult) {
    //   console.log("Local provider returned detailed results");
    //   return localResult;
    // }
    
    // If not in local database, try the original provider
    console.log(`Trying original provider: ${tokenInfo.provider}`);
    try {
      const provider = await this.createProvider(tokenInfo.provider as PlantSearchProviderType);
      
      if (provider.getDetails) {
        const result = await this.tryProviderDetails(provider, accessToken);
        
        if (result) {
          console.log(`${tokenInfo.provider} provider returned detailed results`);
          
          // Store the detailed result in local database for future access
          if (provider.shouldCache()) {
            try {
              await this.localProvider.storeExternalResults(
                result.entity_name, 
                {
                  entities: [result],
                  entities_trimmed: false,
                  limit: 1,
                  provider: tokenInfo.provider,
                  cached: false,
                  search_time_ms: 0,
                  query_normalized: result.entity_name.toLowerCase(),
                  total_found: 1
                }
              );
              console.log(`Cached detailed result for ${result.entity_name}`);
            } catch (error) {
              console.warn(`Failed to cache detailed result:`, error);
            }
          }
          
          return result;
        }
      } else {
        console.log(`Provider ${tokenInfo.provider} does not support details retrieval`);
      }
    } catch (error) {
      console.error(`Failed to get details from ${tokenInfo.provider}:`, error);
    }
    
    // If original provider failed, try other providers that support details
    const fallbackProviders: PlantSearchProviderType[] = ["inaturalist", "gbif", "perenual"];
    
    for (const providerType of fallbackProviders) {
      if (providerType === tokenInfo.provider) continue; // Already tried
      
      try {
        console.log(`Trying fallback provider: ${providerType}`);
        const provider = await this.createProvider(providerType);
        
        if (provider.getDetails) {
          const result = await this.tryProviderDetails(provider, accessToken);
          
          if (result) {
            console.log(`Fallback provider ${providerType} returned results`);
            return result;
          }
        }
      } catch (error) {
        console.error(`Fallback provider ${providerType} failed:`, error);
      }
    }
    
    console.log("All providers failed to retrieve details");
    return null;
  }
  
  /**
   * Try to get details from a specific provider
   */
  private async tryProviderDetails(
    provider: PlantSearchProvider,
    accessToken: string
  ): Promise<PlantSearchEntity | null> {
    try {
      if (!provider.getDetails) {
        return null;
      }
      
      console.log(`Getting details from provider: ${provider.getName()}`);
      const result = await provider.getDetails(accessToken);
      
      if (result) {
        console.log(`Provider ${provider.getName()} returned details for: ${result.entity_name}`);
      }
      
      return result;
    } catch (error) {
      console.error(`Provider ${provider.getName()} details failed:`, error);
      return null;
    }
  }
  
  /**
   * Test all providers
   */
  async testProviders(): Promise<{[key: string]: { available: boolean; error?: string; responseTime?: number }}>  {
    const results: {[key: string]: { available: boolean; error?: string; responseTime?: number }} = {};
    const providersToTest: PlantSearchProviderType[] = ["local", "perenual", "gbif"];
    
    for (const type of providersToTest) {
      const startTime = Date.now();
      try {
        const provider = await this.createProvider(type);
        const available = await provider.isAvailable();
        const responseTime = Date.now() - startTime;
        
        results[type] = { available, responseTime };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results[type] = { 
          available: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime
        };
      }
    }
    
    return results;
  }
}