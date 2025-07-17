-- Migration to update image storage from base64 to R2 URLs
-- This migration adds new columns for R2 image storage and keeps old columns for backward compatibility during migration

-- Add R2 image storage columns to plant_identifications table (skip image_url as it already exists)
ALTER TABLE plant_identifications ADD COLUMN image_key TEXT;
ALTER TABLE plant_identifications ADD COLUMN thumbnail_url TEXT;

-- Create index on image_key for faster lookups
CREATE INDEX idx_plant_identifications_image_key ON plant_identifications(image_key);

-- Add R2 image storage columns to plant_health_assessments table (if it exists)
-- First check if the table exists before altering it
-- ALTER TABLE plant_health_assessments ADD COLUMN image_key TEXT;
-- ALTER TABLE plant_health_assessments ADD COLUMN image_url TEXT;
-- ALTER TABLE plant_health_assessments ADD COLUMN thumbnail_url TEXT;

-- Create a new table for tracking image metadata and usage
CREATE TABLE IF NOT EXISTS image_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_key TEXT NOT NULL UNIQUE,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    content_hash TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    original_filename TEXT,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME,
    access_count INTEGER DEFAULT 0
);

-- Create indexes for cleanup operations
CREATE INDEX idx_image_metadata_uploaded_at ON image_metadata(uploaded_at);
CREATE INDEX idx_image_metadata_last_accessed ON image_metadata(last_accessed);
CREATE INDEX idx_image_metadata_content_hash ON image_metadata(content_hash);

-- Create a junction table to track which images are used by which identifications
CREATE TABLE IF NOT EXISTS identification_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identification_id INTEGER NOT NULL,
    image_key TEXT NOT NULL,
    image_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (identification_id) REFERENCES plant_identifications(id) ON DELETE CASCADE,
    FOREIGN KEY (image_key) REFERENCES image_metadata(image_key) ON DELETE CASCADE,
    
    UNIQUE(identification_id, image_key)
);

-- Create indexes for the junction table
CREATE INDEX idx_identification_images_identification_id ON identification_images(identification_id);
CREATE INDEX idx_identification_images_image_key ON identification_images(image_key);
CREATE INDEX idx_identification_images_primary ON identification_images(is_primary) WHERE is_primary = TRUE;