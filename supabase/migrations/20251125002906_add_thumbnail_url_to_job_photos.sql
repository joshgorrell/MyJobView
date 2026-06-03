/*
  # Add thumbnail URL to job photos

  1. Changes
    - Add `thumbnail_url` column to `job_photos` table to store smaller, optimized versions
    - Allows faster page load times by loading thumbnails in the gallery grid
    - Full resolution photos are loaded only when clicked
*/

ALTER TABLE job_photos 
ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN job_photos.thumbnail_url IS 'URL to optimized thumbnail version of the photo for faster grid loading';