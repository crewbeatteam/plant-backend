-- Migration number: 0001 	 2025-07-12T00:00:00.000Z

-- API Keys table for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);

-- Plant species reference data
CREATE TABLE IF NOT EXISTS plant_species (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    scientific_name TEXT NOT NULL,
    common_names TEXT, -- JSON array of common names
    genus TEXT NOT NULL,
    species TEXT NOT NULL,
    infraspecies TEXT,
    gbif_id INTEGER,
    inaturalist_id INTEGER,
    wikipedia_url TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Plant diseases and health issues reference data
CREATE TABLE IF NOT EXISTS plant_diseases (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    scientific_name TEXT,
    description TEXT,
    treatment TEXT,
    severity_level TEXT, -- low, medium, high
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Plant identification requests
CREATE TABLE IF NOT EXISTS plant_identifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    api_key_id INTEGER NOT NULL,
    image_data TEXT, -- base64 encoded image
    image_url TEXT,
    is_plant REAL, -- probability score
    classification_level TEXT NOT NULL DEFAULT 'all',
    details TEXT, -- comma-separated list of requested details
    result TEXT NOT NULL, -- JSON response
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Plant health assessments
CREATE TABLE IF NOT EXISTS plant_health_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    api_key_id INTEGER NOT NULL,
    image_data TEXT, -- base64 encoded image
    image_url TEXT,
    is_healthy REAL, -- probability score
    diseases_detected TEXT, -- JSON array of detected diseases
    result TEXT NOT NULL, -- JSON response
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_plant_species_scientific ON plant_species(scientific_name);
CREATE INDEX IF NOT EXISTS idx_plant_species_genus ON plant_species(genus);
CREATE INDEX IF NOT EXISTS idx_plant_diseases_name ON plant_diseases(name);
CREATE INDEX IF NOT EXISTS idx_identifications_api_key ON plant_identifications(api_key_id);
CREATE INDEX IF NOT EXISTS idx_identifications_created ON plant_identifications(created_at);
CREATE INDEX IF NOT EXISTS idx_health_assessments_api_key ON plant_health_assessments(api_key_id);
CREATE INDEX IF NOT EXISTS idx_health_assessments_created ON plant_health_assessments(created_at);