/*
  # Create Security Contract Signatures Storage Bucket
  
  1. Storage Bucket
    - `security-contract-signatures` bucket for customer signature images
    - Public access for signed URLs
    - Organized by contract id
  
  2. Security
    - Authenticated users can upload signatures
    - Public read access for viewing signed contracts
    - Only contract owners can delete
*/

-- Create storage bucket for contract signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('security-contract-signatures', 'security-contract-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated uploads contract sigs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads contract sigs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes contract sigs" ON storage.objects;

-- Enable RLS
CREATE POLICY "Allow authenticated uploads contract sigs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'security-contract-signatures');

CREATE POLICY "Allow public reads contract sigs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'security-contract-signatures');

CREATE POLICY "Allow authenticated deletes contract sigs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'security-contract-signatures'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text 
    FROM security_contracts 
    WHERE created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'finance')
    )
  )
);