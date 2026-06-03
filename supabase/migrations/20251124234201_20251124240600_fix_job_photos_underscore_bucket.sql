/*
  # Fix job_photos (underscore) Storage Bucket
  
  Ensures the existing job_photos bucket has proper policies.
  
  ## Changes
  - Makes job_photos bucket public
  - Adds RLS policies for uploads and viewing
  
  ## Security
  - Authenticated users can upload
  - Public can view
  - Users can delete their own uploads
*/

-- Make the bucket public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'job_photos';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload to job_photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job_photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads from job_photos" ON storage.objects;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload to job_photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job_photos');

-- Allow anyone to view photos
CREATE POLICY "Anyone can view job_photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'job_photos');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own uploads from job_photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job_photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);