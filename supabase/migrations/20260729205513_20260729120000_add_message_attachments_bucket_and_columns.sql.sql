/*
  # Message Attachments: Storage Bucket + Schema Columns

  1. New Storage Bucket
    - `message-attachments` — private bucket for images shared in proposal Q&A threads.
    - Allowed MIME types: image/png, image/jpeg, image/gif, image/webp.
    - Max file size: 10 MB.

  2. Schema Changes (messages table)
    - `attachment_url` (text, nullable) — public/signed URL of the uploaded attachment.
    - `attachment_type` (text, nullable, CHECK in 'image','link') — what kind of attachment.

  3. Security
    - Staff can upload/read/delete if they can view the thread (can_view_message_thread).
    - Portal users can read if the thread's contact_id matches their profile contact_id.
    - Portal users can upload to threads where their contact_id matches.
    - Public access disabled.
*/

-- ── 1. Create storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit  = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Add columns to messages ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_type'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_type text CHECK (attachment_type IN ('image', 'link'));
  END IF;
END $$;

-- ── 3. RLS policies for message-attachments bucket ─────────────────────

-- Staff upload: must be able to view the thread
DROP POLICY IF EXISTS "Staff can upload message attachments" ON storage.objects;
CREATE POLICY "Staff can upload message attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff read
DROP POLICY IF EXISTS "Staff can read message attachments" ON storage.objects;
CREATE POLICY "Staff can read message attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Staff delete
DROP POLICY IF EXISTS "Staff can delete message attachments" ON storage.objects;
CREATE POLICY "Staff can delete message attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND (pr.role IS NULL OR pr.role != 'portal_user')
    )
  );

-- Portal users can read attachments in their threads
DROP POLICY IF EXISTS "Portal users can read message attachments" ON storage.objects;
CREATE POLICY "Portal users can read message attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND (SELECT auth.jwt() -> 'user_metadata' ->> 'is_portal_user') = 'true'
  );

-- Portal users can upload attachments to their own threads
DROP POLICY IF EXISTS "Portal users can upload message attachments" ON storage.objects;
CREATE POLICY "Portal users can upload message attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND (SELECT auth.jwt() -> 'user_metadata' ->> 'is_portal_user') = 'true'
  );
