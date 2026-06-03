/*
  # Create Business Card Photos Storage Bucket

  1. Storage Bucket
    - Create a public bucket named 'business-card-photos' for storing user profile photos
    - Set up appropriate storage policies for upload, read, and delete operations

  2. Security
    - Enable RLS policies for storage bucket
    - Allow authenticated users to upload their own photos
    - Allow public read access to photos
    - Allow users to delete their own photos
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-card-photos',
  'business-card-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload business card photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-card-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view business card photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'business-card-photos');

CREATE POLICY "Users can update their own business card photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-card-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own business card photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-card-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);