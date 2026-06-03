/*
  # Tax Exemption Certificates Storage Bucket

  1. Storage
    - Create `tax-certificates` bucket for exemption certificate files
    - Public read access for authorized users
    - Authenticated users can upload certificates

  2. Security
    - RLS policies for bucket access
    - Users can upload certificates for contacts they manage
*/

-- Create tax certificates storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-certificates', 'tax-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload certificates
CREATE POLICY "Users can upload tax certificates for their contacts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tax-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM contacts
    WHERE assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  )
);

-- Allow users to view certificates for their contacts
CREATE POLICY "Users can view tax certificates for their contacts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tax-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM contacts
    WHERE assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  )
);

-- Allow users to update certificates for their contacts
CREATE POLICY "Users can update tax certificates for their contacts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tax-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM contacts
    WHERE assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  )
);

-- Allow users to delete certificates for their contacts
CREATE POLICY "Users can delete tax certificates for their contacts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tax-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM contacts
    WHERE assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  )
);