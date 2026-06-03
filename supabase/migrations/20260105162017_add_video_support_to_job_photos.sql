/*
  # Add Video Support to Job Photos

  1. Changes
    - Add `media_type` column to `job_photos` table to distinguish between photos and videos
    - Update `category` constraint to include more relevant categories

  2. Notes
    - Default media_type is 'photo' for backwards compatibility
    - Supports 'photo' and 'video' types
*/

-- Add media_type column to job_photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_photos' AND column_name = 'media_type'
  ) THEN
    ALTER TABLE job_photos
    ADD COLUMN media_type text NOT NULL DEFAULT 'photo'
    CHECK (media_type IN ('photo', 'video'));
  END IF;
END $$;

-- Update category constraint to include more options
DO $$
BEGIN
  ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_category_check;
  ALTER TABLE job_photos ADD CONSTRAINT job_photos_category_check
  CHECK (category IN ('before', 'during', 'after', 'progress', 'completed', 'issue', 'solution', 'parts', 'general', 'other'));
END $$;

-- Create index on media_type for better query performance
CREATE INDEX IF NOT EXISTS idx_job_photos_media_type ON job_photos(media_type);
