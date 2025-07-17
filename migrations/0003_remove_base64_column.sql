-- Migration to remove base64 image_data column since we now use R2 storage
-- This migration removes the old base64 storage column to complete the transition

-- Drop the image_data column that stored base64 encoded images
-- Note: In production, you might want to backup this data first
ALTER TABLE plant_identifications DROP COLUMN image_data;