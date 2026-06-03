/*
  # Fix Job Photos Storage Bucket Policies
  
  Sets up proper RLS policies for the job_photos storage bucket.
  
  ## Changes
  - Ensures job_photos bucket exists and is public
  - Adds RLS policies for authenticated users to upload and view
  - Allows public access for viewing photos
  
  ## Security
  - Only authenticated users can upload
  - Everyone can view (for customer portals and public galleries)
  - Users can delete their own uploads
*/

-- Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload job photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own job photos" ON storage.objects;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload job photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-photos');

-- Allow anyone to view photos (for customer portal and public viewing)
CREATE POLICY "Anyone can view job photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'job-photos');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own job photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);