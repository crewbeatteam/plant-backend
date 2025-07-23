import type { 
  PlantSearchProvider, 
  PlantSearchRequest, 
  PlantSearchResult, 
  PlantSearchProviderInfo,
  PlantSearchEntity 
} from './interface';
import { PlantSearchDatabase, normalizeQuery, hashQuery } from './utils';

export class LocalPlantSearchProvider implements PlantSearchProvider {
  private db: PlantSearchDatabase;
  
  constructor(database: D1Database) {
    this.db = new PlantSearchDatabase(database);
  }
  
  async search(request: PlantSearchRequest): Promise<PlantSearchResult> {
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(request.query);
    const limit = request.limit || 10;
    
    try {
      // Record the search query for analytics
      await this.db.recordQuery(request.query);
      
      // Search local database with fuzzy matching
      const entities = await this.db.searchLocal(request.query, limit);
      
      const searchTime = Date.now() - startTime;
      
      // Record stats for local provider
      await this.db.recordProviderStats('local', true, searchTime, entities.length);
      
      // Apply any filters if specified
      const filteredEntities = this.applyFilters(entities, request.filters);
      
      return {
        entities: filteredEntities.slice(0, limit),
        entities_trimmed: filteredEntities.length > limit,
        limit: limit,
        provider: 'local',
        cached: true,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: filteredEntities.length
      };
      
    } catch (error) {
      const searchTime = Date.now() - startTime;
      
      // Record failed stats
      await this.db.recordProviderStats('local', false, searchTime, 0);
      
      console.error('Local plant search error:', error);
      
      // Return empty results on error
      return {
        entities: [],
        entities_trimmed: false,
        limit: limit,
        provider: 'local',
        cached: true,
        search_time_ms: searchTime,
        query_normalized: normalizedQuery,
        total_found: 0
      };
    }
  }
  
  getName(): string {
    return 'Local Database';
  }
  
  async isAvailable(): Promise<boolean> {
    // Local provider is always available if database is accessible
    try {
      // Simple test query to check database connectivity
      const testStmt = this.db['db'].prepare('SELECT 1 as test');
      await testStmt.first();
      return true;
    } catch (error) {
      console.error('Local database connectivity check failed:', error);
      return false;
    }
  }
  
  shouldCache(): boolean {
    // Local provider doesn't need to cache since it IS the cache
    return false;
  }
  
  getProviderInfo(): PlantSearchProviderInfo {
    return {
      name: 'Local Database',
      description: 'Searches locally stored plant data from previous external API calls with fuzzy matching capabilities',
      capabilities: {
        fuzzy_search: true,
        filters: true,
        images: true,
        taxonomy: true,
        common_names: true,
        synonyms: true,
        location_based: false
      },
      rate_limits: {
        requests_per_minute: 1000,    // Very high since it's local
        requests_per_day: 100000
      },
      cost: {
        free_tier: -1,                // Unlimited
        cost_per_request: 0
      }
    };
  }
  
  /**
   * Apply filters to search results
   */
  private applyFilters(entities: PlantSearchEntity[], filters?: any): PlantSearchEntity[] {
    if (!filters) {
      return entities;
    }
    
    return entities.filter(entity => {
      const characteristics = entity.details?.characteristics;
      
      if (!characteristics) {
        return true; // Include entities without characteristics data
      }
      
      // Apply indoor/outdoor filters
      if (filters.indoor !== undefined && characteristics.indoor !== filters.indoor) {
        return false;
      }
      if (filters.outdoor !== undefined && characteristics.outdoor !== filters.outdoor) {
        return false;
      }
      
      // Apply edible/poisonous filters
      if (filters.edible !== undefined && characteristics.edible !== filters.edible) {
        return false;
      }
      if (filters.poisonous !== undefined && characteristics.poisonous !== filters.poisonous) {
        return false;
      }
      
      // Apply care level filters
      if (filters.difficulty && characteristics.difficulty !== filters.difficulty) {
        return false;
      }
      if (filters.care_level && characteristics.care_level !== filters.care_level) {
        return false;
      }
      
      // Apply environmental filters
      if (filters.sunlight && characteristics.sunlight !== filters.sunlight) {
        return false;
      }
      if (filters.watering && characteristics.watering !== filters.watering) {
        return false;
      }
      if (filters.cycle && characteristics.cycle !== filters.cycle) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Store external provider results in local database
   */
  async storeExternalResults(
    query: string, 
    results: PlantSearchResult, 
    providerData?: any[]
  ): Promise<void> {
    try {
      // Record the query
      const queryId = await this.db.recordQuery(query);
      
      // Store each entity
      const storedEntities: number[] = [];
      for (let i = 0; i < results.entities.length; i++) {
        const entity = results.entities[i];
        const entityProviderData = providerData && providerData[i] ? providerData[i] : null;
        
        const entityId = await this.db.storeEntity(entity, entityProviderData);
        storedEntities.push(entityId);
      }
      
      // Store the search results linking
      await this.db.storeSearchResults(queryId, results.entities, results.provider);
      
      console.log(`Stored ${results.entities.length} plant entities from ${results.provider} for query: "${query}"`);
      
    } catch (error) {
      console.error('Failed to store external search results:', error);
      // Don't throw error - failing to cache shouldn't break the search
    }
  }
  
  /**
   * Get popular search queries for analytics
   */
  async getPopularQueries(limit: number = 10): Promise<Array<{query: string, count: number}>> {
    try {
      const stmt = this.db['db'].prepare(`
        SELECT query_original, search_count 
        FROM plant_search_queries 
        ORDER BY search_count DESC, last_searched_at DESC 
        LIMIT ?
      `);
      
      const queryResult = await stmt.bind(limit).all();
      const results = queryResult.results as Array<{query_original: string, search_count: number}>;
      
      return results.map(row => ({
        query: row.query_original,
        count: row.search_count
      }));
      
    } catch (error) {
      console.error('Failed to get popular queries:', error);
      return [];
    }
  }
  
  /**
   * Get search statistics
   */
  async getSearchStats(days: number = 7): Promise<{
    total_searches: number;
    unique_queries: number;
    cached_hits: number;
    popular_queries: Array<{query: string, count: number}>;
  }> {
    try {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);
      const threshold = dateThreshold.toISOString();
      
      // Get total searches in period
      const totalStmt = this.db['db'].prepare(`
        SELECT SUM(search_count) as total FROM plant_search_queries 
        WHERE last_searched_at >= ?
      `);
      const totalResult = await totalStmt.bind(threshold).first() as {total: number} | null;
      
      // Get unique queries in period
      const uniqueStmt = this.db['db'].prepare(`
        SELECT COUNT(*) as count FROM plant_search_queries 
        WHERE last_searched_at >= ?
      `);
      const uniqueResult = await uniqueStmt.bind(threshold).first() as {count: number} | null;
      
      // Get local provider hits (cached hits)
      const stats = await this.db.getProviderStats('local', days);
      const cachedHits = stats.reduce((sum, stat) => sum + stat.successful_requests, 0);
      
      // Get popular queries
      const popularQueries = await this.getPopularQueries(5);
      
      return {
        total_searches: totalResult?.total || 0,
        unique_queries: uniqueResult?.count || 0,
        cached_hits: cachedHits,
        popular_queries: popularQueries
      };
      
    } catch (error) {
      console.error('Failed to get search stats:', error);
      return {
        total_searches: 0,
        unique_queries: 0,
        cached_hits: 0,
        popular_queries: []
      };
    }
  }
  
  /**
   * Clean up old search data (optional maintenance)
   */
  async cleanup(daysToKeep: number = 90): Promise<{removed_queries: number, removed_results: number}> {
    try {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - daysToKeep);
      const threshold = dateThreshold.toISOString();
      
      // Remove old search results first (foreign key constraint)
      const resultsStmt = this.db['db'].prepare(`
        DELETE FROM plant_search_results 
        WHERE query_id IN (
          SELECT id FROM plant_search_queries 
          WHERE last_searched_at < ? AND search_count = 1
        )
      `);
      const resultsResult = await resultsStmt.bind(threshold).run();
      
      // Remove old single-use queries
      const queriesStmt = this.db['db'].prepare(`
        DELETE FROM plant_search_queries 
        WHERE last_searched_at < ? AND search_count = 1
      `);
      const queriesResult = await queriesStmt.bind(threshold).run();
      
      console.log(`Cleaned up ${queriesResult.meta.changes} old queries and ${resultsResult.meta.changes} results`);
      
      return {
        removed_queries: queriesResult.meta.changes as number,
        removed_results: resultsResult.meta.changes as number
      };
      
    } catch (error) {
      console.error('Failed to cleanup old search data:', error);
      return { removed_queries: 0, removed_results: 0 };
    }
  }
}