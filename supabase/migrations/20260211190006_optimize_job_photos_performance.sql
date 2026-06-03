/*
  # Optimize Job Photos Gallery Performance

  1. Performance Improvements
    - Add index on job_photos.created_at for faster sorting
    - Add composite index for efficient pagination queries
    - Add index on job_photo_likes for faster like count queries

  2. Notes
    - These indexes significantly improve query performance for the gallery
    - The created_at index helps with ORDER BY queries
    - The composite index helps with range queries used in pagination
*/

-- Add index for sorting by created_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_job_photos_created_at_desc
ON job_photos (created_at DESC);

-- Add composite index for efficient pagination with filtering
CREATE INDEX IF NOT EXISTS idx_job_photos_category_created_at
ON job_photos (category, created_at DESC);

-- Add index for media type filtering
CREATE INDEX IF NOT EXISTS idx_job_photos_media_type_created_at
ON job_photos (media_type, created_at DESC);

-- Add index for faster like count queries
CREATE INDEX IF NOT EXISTS idx_job_photo_likes_photo_id
ON job_photo_likes (photo_id);

-- Add index for user likes lookup
CREATE INDEX IF NOT EXISTS idx_job_photo_likes_user_photo
ON job_photo_likes (user_id, photo_id);
