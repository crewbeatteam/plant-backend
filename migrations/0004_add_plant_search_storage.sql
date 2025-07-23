-- Migration number: 0004 	 2025-07-23T00:00:00.000Z

-- Plant search entities - permanent storage of all plant data from external providers
CREATE TABLE IF NOT EXISTS plant_search_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    entity_name TEXT NOT NULL,                    -- Scientific name (primary identifier)
    common_names TEXT,                           -- JSON array of common names
    synonyms TEXT,                               -- JSON array of scientific name synonyms
    provider_source TEXT NOT NULL,              -- Which provider this came from (perenual, gbif, inaturalist, openai)
    provider_id TEXT,                            -- Original provider's internal ID
    provider_data TEXT,                          -- JSON of all provider-specific data
    taxonomy_data TEXT,                          -- JSON of taxonomy hierarchy
    characteristics_data TEXT,                   -- JSON of plant characteristics (indoor, edible, care level, etc)
    image_urls TEXT,                            -- JSON array of image URLs
    thumbnail_url TEXT,                         -- Primary thumbnail URL
    wikipedia_url TEXT,                         -- Wikipedia link if available
    gbif_id INTEGER,                            -- GBIF taxon ID if available
    inaturalist_id INTEGER,                     -- iNaturalist taxon ID if available
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Plant search queries - track all searches for analytics and fuzzy matching
CREATE TABLE IF NOT EXISTS plant_search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    query_original TEXT NOT NULL,              -- Original search query as entered
    query_normalized TEXT NOT NULL,            -- Normalized query (lowercase, trimmed)
    query_hash TEXT NOT NULL,                  -- Hash for quick lookups
    search_count INTEGER NOT NULL DEFAULT 1,   -- How many times this exact query was searched
    last_searched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Plant search results - link queries to found entities
CREATE TABLE IF NOT EXISTS plant_search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    query_id INTEGER NOT NULL,                 -- References plant_search_queries.id
    entity_id INTEGER NOT NULL,               -- References plant_search_entities.id
    matched_in TEXT NOT NULL,                 -- What text matched (scientific name, common name, etc)
    matched_in_type TEXT NOT NULL,           -- entity_name, common_name, synonym
    match_position INTEGER NOT NULL,         -- Position in string where match occurred
    match_length INTEGER NOT NULL,           -- Length of the match
    confidence_score REAL,                   -- Match confidence (0-1)
    provider_used TEXT NOT NULL,             -- Which provider found this result
    result_position INTEGER NOT NULL,        -- Position in search results (for ranking)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (query_id) REFERENCES plant_search_queries(id),
    FOREIGN KEY (entity_id) REFERENCES plant_search_entities(id)
);

-- Provider statistics - track performance and reliability
CREATE TABLE IF NOT EXISTS plant_search_provider_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    provider_name TEXT NOT NULL,             -- perenual, gbif, inaturalist, openai, local
    search_date DATE NOT NULL,               -- Date for daily aggregation
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms INTEGER,            -- Average response time in milliseconds
    avg_results_returned REAL,              -- Average number of results per successful search
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_name, search_date)
);

-- Search sessions - track user search patterns (optional for analytics)
CREATE TABLE IF NOT EXISTS plant_search_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    api_key_id INTEGER NOT NULL,
    session_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_end DATETIME,
    total_queries INTEGER NOT NULL DEFAULT 0,
    unique_queries INTEGER NOT NULL DEFAULT 0,
    successful_queries INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_plant_entities_name ON plant_search_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_plant_entities_provider ON plant_search_entities(provider_source);
CREATE INDEX IF NOT EXISTS idx_plant_entities_gbif ON plant_search_entities(gbif_id);
CREATE INDEX IF NOT EXISTS idx_plant_entities_inaturalist ON plant_search_entities(inaturalist_id);
CREATE INDEX IF NOT EXISTS idx_plant_entities_created ON plant_search_entities(created_at);

CREATE INDEX IF NOT EXISTS idx_plant_queries_hash ON plant_search_queries(query_hash);
CREATE INDEX IF NOT EXISTS idx_plant_queries_normalized ON plant_search_queries(query_normalized);
CREATE INDEX IF NOT EXISTS idx_plant_queries_count ON plant_search_queries(search_count);
CREATE INDEX IF NOT EXISTS idx_plant_queries_last_searched ON plant_search_queries(last_searched_at);

CREATE INDEX IF NOT EXISTS idx_plant_results_query ON plant_search_results(query_id);
CREATE INDEX IF NOT EXISTS idx_plant_results_entity ON plant_search_results(entity_id);
CREATE INDEX IF NOT EXISTS idx_plant_results_provider ON plant_search_results(provider_used);
CREATE INDEX IF NOT EXISTS idx_plant_results_confidence ON plant_search_results(confidence_score);
CREATE INDEX IF NOT EXISTS idx_plant_results_position ON plant_search_results(result_position);

CREATE INDEX IF NOT EXISTS idx_provider_stats_name_date ON plant_search_provider_stats(provider_name, search_date);
CREATE INDEX IF NOT EXISTS idx_provider_stats_date ON plant_search_provider_stats(search_date);

CREATE INDEX IF NOT EXISTS idx_search_sessions_api_key ON plant_search_sessions(api_key_id);
CREATE INDEX IF NOT EXISTS idx_search_sessions_start ON plant_search_sessions(session_start);

-- Full-text search indexes for fuzzy matching (SQLite FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS plant_search_fts USING fts5(
    entity_id,
    entity_name,
    common_names,
    synonyms,
    content='plant_search_entities',
    content_rowid='id'
);

-- Trigger to keep FTS index in sync with main table
CREATE TRIGGER IF NOT EXISTS plant_entities_fts_insert AFTER INSERT ON plant_search_entities BEGIN
    INSERT INTO plant_search_fts(entity_id, entity_name, common_names, synonyms)
    VALUES (new.id, new.entity_name, ifnull(new.common_names, ''), ifnull(new.synonyms, ''));
END;

CREATE TRIGGER IF NOT EXISTS plant_entities_fts_update AFTER UPDATE ON plant_search_entities BEGIN
    UPDATE plant_search_fts SET
        entity_name = new.entity_name,
        common_names = ifnull(new.common_names, ''),
        synonyms = ifnull(new.synonyms, '')
    WHERE entity_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS plant_entities_fts_delete AFTER DELETE ON plant_search_entities BEGIN
    DELETE FROM plant_search_fts WHERE entity_id = old.id;
END;