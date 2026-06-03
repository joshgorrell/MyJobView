/*
  # Create Organization Logos Storage Bucket
  
  1. New Storage Bucket
    - `organization_logos` - Stores company logo files for tenant organizations
    
  2. Security
    - Public access for reading logos (displayed in app header)
    - Authenticated users can upload during signup
    - Restrict file types to images only
    - Restrict file size to 5MB
*/

-- Create organization_logos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization_logos',
  'organization_logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']::text[];

-- Allow anonymous uploads during signup (will be validated by edge function)
DROP POLICY IF EXISTS "Allow anonymous uploads during signup" ON storage.objects;
CREATE POLICY "Allow anonymous uploads during signup"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'organization_logos'
  );

-- Allow authenticated users to upload organization logos
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'organization_logos'
  );

-- Allow public read access for all logos
DROP POLICY IF EXISTS "Public read access for organization logos" ON storage.objects;
CREATE POLICY "Public read access for organization logos"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'organization_logos');

-- Allow authenticated users to update their organization's logo
DROP POLICY IF EXISTS "Allow organization admins to update logos" ON storage.objects;
CREATE POLICY "Allow organization admins to update logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'organization_logos' AND
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
      )
      OR
      public.is_global_admin()
    )
  );

-- Allow authenticated users to delete their organization's logo
DROP POLICY IF EXISTS "Allow organization admins to delete logos" ON storage.objects;
CREATE POLICY "Allow organization admins to delete logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'organization_logos' AND
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
      )
      OR
      public.is_global_admin()
    )
  );
