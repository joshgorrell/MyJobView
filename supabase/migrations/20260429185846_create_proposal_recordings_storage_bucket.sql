/*
  # Create proposal-recordings storage bucket

  1. New Storage Bucket
    - `proposal-recordings` - private bucket for storing in-app recorded videos
    - Path format: {organization_id}/{proposal_id}/{recording_id}.webm
    - Max file size: 500MB

  2. Security
    - Authenticated staff can upload/read/delete their org's recordings
    - Portal users can read recordings (access controlled via signed URLs in app logic)
    - Public access is disabled
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-recordings',
  'proposal-recordings',
  false,
  524288000, -- 500MB in bytes
  ARRAY['video/webm', 'video/mp4', 'video/ogg', 'video/quicktime', 'audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Staff upload policy
DROP POLICY IF EXISTS "Staff can upload proposal recordings" ON storage.objects;
CREATE POLICY "Staff can upload proposal recordings"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-recordings'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff read policy
DROP POLICY IF EXISTS "Staff can read proposal recordings" ON storage.objects;
CREATE POLICY "Staff can read proposal recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proposal-recordings'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff delete policy
DROP POLICY IF EXISTS "Staff can delete proposal recordings" ON storage.objects;
CREATE POLICY "Staff can delete proposal recordings"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-recordings'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Portal users can read recordings (we use signed URLs so this is a safety net)
DROP POLICY IF EXISTS "Portal users can read proposal recordings" ON storage.objects;
CREATE POLICY "Portal users can read proposal recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proposal-recordings'
    AND (SELECT auth.jwt() -> 'user_metadata' ->> 'is_portal_user') = 'true'
  );
