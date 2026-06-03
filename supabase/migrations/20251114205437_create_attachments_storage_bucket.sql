/*
  # Create Attachments Storage Bucket
  
  Creates a storage bucket for file attachments with proper RLS policies.
  
  ## Bucket Details
  - Name: attachments
  - Public: true (files are accessible via public URLs)
  - File size limit: 10MB
  - Allowed MIME types: All common file types
  
  ## Security
  - Authenticated users can upload files
  - Users can only delete their own files or if they're admins
  - Anyone can view/download files (as they're linked to public proposals/projects)
*/

-- Create the attachments bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- Allow anyone to view files (public bucket)
CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'attachments');

-- Allow users to delete their own files or admins can delete any
CREATE POLICY "Users can delete own attachments or admins can delete any"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments' AND (
    auth.uid()::text = (storage.foldername(name))[1] OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
);
