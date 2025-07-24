import type { PlantSearchRequest, PlantSearchEntity, StoredPlantEntity, PlantSearchStats } from './interface';

/**
 * Normalize search query for consistent matching and caching
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')                    // Multiple spaces to single space
    .replace(/[^\w\s-]/g, '')                // Remove special chars except hyphens
    .substring(0, 200);                      // Limit length
}

/**
 * Generate hash for query caching
 */
export function hashQuery(query: string, filters?: any): string {
  const normalized = normalizeQuery(query);
  const filterString = filters ? JSON.stringify(filters) : '';
  const combined = `${normalized}|${filterString}`;
  
  // Simple hash function (for production, consider crypto.subtle)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate access token for plant search results
 */
export function generateAccessToken(entityId: number, provider: string): string {
  const tokenData = `plant_search_${entityId}_${provider}_${Date.now()}`;
  // Use Web API TextEncoder and btoa instead of Node.js Buffer
  const encoder = new TextEncoder();
  const data = encoder.encode(tokenData);
  const base64 = btoa(String.fromCharCode(...data));
  return base64; // Don't truncate the token
}

/**
 * Parse access token to get entity information
 */
export function parseAccessToken(token: string): { entityId: number; provider: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    console.log('Decoded token:', decoded);
    
    // Try full format first: plant_search_12345_provider_timestamp
    let match = decoded.match(/plant_search_(\d+)_([^_]+)_\d+/);
    if (match) {
      return {
        entityId: parseInt(match[1]),
        provider: match[2]
      };
    }
    
    // Handle truncated tokens (backward compatibility): plant_search_12345_provid
    match = decoded.match(/plant_search_(\d+)_([^_]+)/);
    if (match) {
      // Try to infer provider from partial name
      const partialProvider = match[2];
      let fullProvider = partialProvider;
      
      // Map partial names to full provider names
      if (partialProvider.startsWith('inatu')) fullProvider = 'inaturalist';
      else if (partialProvider.startsWith('gbif')) fullProvider = 'gbif';
      else if (partialProvider.startsWith('peren')) fullProvider = 'perenual';
      else if (partialProvider.startsWith('powo')) fullProvider = 'powo';
      else if (partialProvider.startsWith('local')) fullProvider = 'local';
      else if (partialProvider.startsWith('mock')) fullProvider = 'mock';
      
      console.log(`Inferred provider '${fullProvider}' from partial '${partialProvider}'`);
      
      return {
        entityId: parseInt(match[1]),
        provider: fullProvider
      };
    }
    
    console.warn('Token does not match expected format:', decoded);
  } catch (error) {
    console.warn('Failed to parse access token:', error);
  }
  return null;
}

/**
 * Calculate fuzzy match score between two strings
 */
export function calculateSimilarity(query: string, target: string): number {
  const normalizedQuery = normalizeQuery(query);
  const normalizedTarget = normalizeQuery(target);
  
  // Exact match
  if (normalizedQuery === normalizedTarget) {
    return 1.0;
  }
  
  // Contains match
  if (normalizedTarget.includes(normalizedQuery)) {
    const ratio = normalizedQuery.length / normalizedTarget.length;
    return 0.8 * ratio; // High score for contains, weighted by length ratio
  }
  
  // Starts with match
  if (normalizedTarget.startsWith(normalizedQuery)) {
    const ratio = normalizedQuery.length / normalizedTarget.length;
    return 0.9 * ratio;
  }
  
  // Levenshtein-like similarity (simplified)
  return calculateLevenshteinSimilarity(normalizedQuery, normalizedTarget);
}

/**
 * Simple Levenshtein distance similarity calculation
 */
function calculateLevenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;
  
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  const maxLength = Math.max(a.length, b.length);
  const distance = matrix[b.length][a.length];
  return Math.max(0, (maxLength - distance) / maxLength);
}

/**
 * Database helper functions
 */
export class PlantSearchDatabase {
  constructor(private db: D1Database) {}
  
  /**
   * Store a plant entity permanently
   */
  async storeEntity(entity: PlantSearchEntity, providerData?: any): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO plant_search_entities (
        entity_name, common_names, synonyms, provider_source, provider_id,
        provider_data, taxonomy_data, characteristics_data, image_urls,
        thumbnail_url, wikipedia_url, gbif_id, inaturalist_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const result = await stmt.bind(
      entity.entity_name,
      entity.common_names ? JSON.stringify(entity.common_names) : null,
      entity.synonyms ? JSON.stringify(entity.synonyms) : null,
      entity.provider_source,
      entity.provider_id || null,
      providerData ? JSON.stringify(providerData) : null,
      entity.details?.taxonomy ? JSON.stringify(entity.details.taxonomy) : null,
      entity.details?.characteristics ? JSON.stringify(entity.details.characteristics) : null,
      entity.details?.images ? JSON.stringify(entity.details.images.map(img => img.url)) : null,
      entity.thumbnail || null,
      entity.details?.wikipedia?.url || null,
      entity.details?.external_ids?.gbif_id || null,
      entity.details?.external_ids?.inaturalist_id || null
    ).run();
    
    return result.meta.last_row_id as number;
  }
  
  /**
   * Record search query
   */
  async recordQuery(query: string): Promise<number> {
    const normalized = normalizeQuery(query);
    const hash = hashQuery(query);
    
    // Try to update existing query first
    const updateStmt = this.db.prepare(`
      UPDATE plant_search_queries 
      SET search_count = search_count + 1, last_searched_at = CURRENT_TIMESTAMP
      WHERE query_hash = ?
    `);
    
    const updateResult = await updateStmt.bind(hash).run();
    
    if (updateResult.meta.changes === 0) {
      // Insert new query
      const insertStmt = this.db.prepare(`
        INSERT INTO plant_search_queries (query_original, query_normalized, query_hash)
        VALUES (?, ?, ?)
      `);
      
      const insertResult = await insertStmt.bind(query, normalized, hash).run();
      return insertResult.meta.last_row_id as number;
    }
    
    // Get existing query ID
    const getStmt = this.db.prepare('SELECT id FROM plant_search_queries WHERE query_hash = ?');
    const existing = await getStmt.bind(hash).first() as { id: number } | null;
    return existing?.id || 0;
  }
  
  /**
   * Store search results linking query to entities
   */
  async storeSearchResults(queryId: number, entities: PlantSearchEntity[], provider: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO plant_search_results (
        query_id, entity_id, matched_in, matched_in_type, match_position,
        match_length, confidence_score, provider_used, result_position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      // We need the entity ID from the database
      const entityIdStmt = this.db.prepare('SELECT id FROM plant_search_entities WHERE entity_name = ? AND provider_source = ?');
      const storedEntity = await entityIdStmt.bind(entity.entity_name, entity.provider_source).first() as { id: number } | null;
      
      if (storedEntity) {
        await stmt.bind(
          queryId,
          storedEntity.id,
          entity.matched_in,
          entity.matched_in_type,
          entity.match_position,
          entity.match_length,
          entity.confidence || 0,
          provider,
          i
        ).run();
      }
    }
  }
  
  /**
   * Search local database with fuzzy matching
   */
  async searchLocal(query: string, limit: number = 10): Promise<PlantSearchEntity[]> {
    const normalized = normalizeQuery(query);
    
    // First try exact matches
    const exactStmt = this.db.prepare(`
      SELECT * FROM plant_search_entities 
      WHERE LOWER(entity_name) LIKE ? OR 
            LOWER(common_names) LIKE ? OR 
            LOWER(synonyms) LIKE ?
      ORDER BY 
        CASE 
          WHEN LOWER(entity_name) = ? THEN 1
          WHEN LOWER(entity_name) LIKE ? THEN 2
          ELSE 3
        END
      LIMIT ?
    `);
    
    const exactPattern = `%${normalized}%`;
    const startPattern = `${normalized}%`;
    
    const exactQuery = await exactStmt.bind(
      exactPattern, exactPattern, exactPattern,
      normalized, startPattern, limit
    ).all();
    const exactResults = exactQuery.results as unknown as StoredPlantEntity[];
    
    // If we have enough exact matches, return them
    if (exactResults.length >= limit) {
      return exactResults.slice(0, limit).map((entity, index) => 
        this.convertStoredEntityToSearchEntity(entity, query, normalized, index)
      );
    }
    
    // Otherwise, try FTS search for fuzzy matching
    const ftsStmt = this.db.prepare(`
      SELECT e.* FROM plant_search_entities e
      JOIN plant_search_fts fts ON e.id = fts.entity_id
      WHERE fts MATCH ?
      ORDER BY fts.bm25(fts)
      LIMIT ?
    `);
    
    const ftsQuery = await ftsStmt.bind(normalized, limit - exactResults.length).all();
    const ftsResults = ftsQuery.results as unknown as StoredPlantEntity[];
    
    // Combine and deduplicate results
    const allResults = [...exactResults];
    const exactIds = new Set(exactResults.map(e => e.id));
    
    for (const ftsResult of ftsResults) {
      if (!exactIds.has(ftsResult.id)) {
        allResults.push(ftsResult);
      }
    }
    
    return allResults.slice(0, limit).map((entity, index) => 
      this.convertStoredEntityToSearchEntity(entity, query, normalized, index)
    );
  }
  
  /**
   * Convert stored entity to search entity format
   */
  private convertStoredEntityToSearchEntity(
    stored: StoredPlantEntity, 
    originalQuery: string, 
    normalizedQuery: string, 
    position: number
  ): PlantSearchEntity {
    const commonNames = stored.common_names ? (typeof stored.common_names === 'string' ? JSON.parse(stored.common_names) : stored.common_names) : [];
    const synonyms = stored.synonyms ? (typeof stored.synonyms === 'string' ? JSON.parse(stored.synonyms) : stored.synonyms) : [];
    
    // Determine what matched and where
    const entityNameLower = stored.entity_name.toLowerCase();
    const matchInEntityName = entityNameLower.indexOf(normalizedQuery);
    
    let matchedIn = stored.entity_name;
    let matchedInType: 'entity_name' | 'common_name' | 'synonym' = 'entity_name';
    let matchPosition = matchInEntityName;
    
    // Check if match was in common names
    if (matchInEntityName === -1) {
      for (const commonName of commonNames) {
        const commonNameMatch = commonName.toLowerCase().indexOf(normalizedQuery);
        if (commonNameMatch !== -1) {
          matchedIn = commonName;
          matchedInType = 'common_name';
          matchPosition = commonNameMatch;
          break;
        }
      }
    }
    
    // Check if match was in synonyms
    if (matchInEntityName === -1 && matchedInType === 'entity_name') {
      for (const synonym of synonyms) {
        const synonymMatch = synonym.toLowerCase().indexOf(normalizedQuery);
        if (synonymMatch !== -1) {
          matchedIn = synonym;
          matchedInType = 'synonym';
          matchPosition = synonymMatch;
          break;
        }
      }
    }
    
    const confidence = calculateSimilarity(normalizedQuery, matchedIn.toLowerCase());
    
    return {
      matched_in: matchedIn,
      matched_in_type: matchedInType,
      access_token: generateAccessToken(stored.id, stored.provider_source),
      match_position: Math.max(0, matchPosition),
      match_length: originalQuery.length,
      entity_name: stored.entity_name,
      common_names: commonNames,
      synonyms: synonyms,
      thumbnail: stored.thumbnail_url || undefined,
      confidence: confidence,
      provider_source: stored.provider_source,
      provider_id: stored.provider_id || undefined,
      details: {
        taxonomy: stored.taxonomy_data ? JSON.parse(stored.taxonomy_data) : undefined,
        characteristics: stored.characteristics_data ? JSON.parse(stored.characteristics_data) : undefined,
        external_ids: {
          gbif_id: stored.gbif_id || undefined,
          inaturalist_id: stored.inaturalist_id || undefined,
        },
        images: stored.image_urls ? (typeof stored.image_urls === 'string' ? JSON.parse(stored.image_urls) : stored.image_urls).map((url: string) => ({ url })) : undefined,
        wikipedia: stored.wikipedia_url ? { title: stored.entity_name, url: stored.wikipedia_url } : undefined,
      }
    };
  }
  
  /**
   * Record provider statistics
   */
  async recordProviderStats(
    provider: string, 
    success: boolean, 
    responseTimeMs: number, 
    resultsCount: number = 0
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const stmt = this.db.prepare(`
      INSERT INTO plant_search_provider_stats (
        provider_name, search_date, total_requests, successful_requests,
        failed_requests, avg_response_time_ms, avg_results_returned
      ) VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(provider_name, search_date) DO UPDATE SET
        total_requests = total_requests + 1,
        successful_requests = successful_requests + ?,
        failed_requests = failed_requests + ?,
        avg_response_time_ms = (avg_response_time_ms * (total_requests - 1) + ?) / total_requests,
        avg_results_returned = (avg_results_returned * (successful_requests - ?) + ?) / successful_requests,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    const successCount = success ? 1 : 0;
    const failCount = success ? 0 : 1;
    
    await stmt.bind(
      provider, today, successCount, failCount, responseTimeMs, resultsCount,
      successCount, failCount, responseTimeMs, successCount, resultsCount
    ).run();
  }
  
  /**
   * Get provider statistics
   */
  async getProviderStats(provider?: string, days: number = 7): Promise<PlantSearchStats[]> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);
    const threshold = dateThreshold.toISOString().split('T')[0];
    
    let stmt;
    let params: any[] = [threshold];
    
    if (provider) {
      stmt = this.db.prepare(`
        SELECT * FROM plant_search_provider_stats 
        WHERE provider_name = ? AND search_date >= ?
        ORDER BY search_date DESC
      `);
      params = [provider, threshold];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM plant_search_provider_stats 
        WHERE search_date >= ?
        ORDER BY provider_name, search_date DESC
      `);
    }
    
    const queryResult = await stmt.bind(...params).all();
    const results = queryResult.results as any[];
    
    return results.map(row => ({
      provider_name: row.provider_name,
      search_date: row.search_date,
      total_requests: row.total_requests,
      successful_requests: row.successful_requests,
      failed_requests: row.failed_requests,
      avg_response_time_ms: row.avg_response_time_ms,
      avg_results_returned: row.avg_results_returned,
      success_rate: row.total_requests > 0 ? row.successful_requests / row.total_requests : 0
    }));
  }
}