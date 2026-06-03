/*
  # Create Punchlist Photos Storage Bucket

  ## Summary
  Creates storage bucket for punchlist task photos with appropriate access policies.

  ## Changes
  - Creates 'punchlist-photos' bucket
  - Public read access for authenticated users
  - Customers can upload to their own task folders
  - Staff can upload to any task folder
*/

-- Create storage bucket for punchlist photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'punchlist-photos',
  'punchlist-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view punchlist photos" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload to own task folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own punchlist photos" ON storage.objects;

-- Allow authenticated users to read all punchlist photos
CREATE POLICY "Authenticated users can view punchlist photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'punchlist-photos');

-- Allow customers to upload photos to their own task folders
CREATE POLICY "Customers can upload to own task folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'punchlist-photos'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'production_manager', 'technician', 'office')
      )
      OR
      EXISTS (
        SELECT 1 FROM punchlist_tasks pt
        JOIN punchlist_access_grants pag ON pag.contact_id = pt.contact_id
        WHERE pt.id::text = (string_to_array(name, '/'))[1]
        AND pag.contact_id IN (
          SELECT contact_id FROM profiles WHERE id = auth.uid()
        )
        AND pag.status = 'active'
        AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
      )
    )
  );

-- Allow users to delete their own uploaded photos
CREATE POLICY "Users can delete own punchlist photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'punchlist-photos'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'production_manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM punchlist_tasks pt
        JOIN punchlist_access_grants pag ON pag.contact_id = pt.contact_id
        WHERE pt.id::text = (string_to_array(name, '/'))[1]
        AND pag.contact_id IN (
          SELECT contact_id FROM profiles WHERE id = auth.uid()
        )
        AND pag.status = 'active'
        AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
      )
    )
  );
