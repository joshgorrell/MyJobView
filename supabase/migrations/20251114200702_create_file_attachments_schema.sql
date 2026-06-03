/*
  # Create File Attachments Schema

  1. New Tables
    - `file_attachments`
      - `id` (uuid, primary key)
      - `company_id` (uuid)
      - `uploaded_by` (uuid, references auth.users)
      - `file_name` (text)
      - `file_size` (bigint) - in bytes
      - `file_type` (text) - MIME type
      - `storage_path` (text) - path in Supabase storage
      - `context_type` (text: message, proposal, project, contact) - nullable
      - `context_id` (uuid) - nullable
      - `message_id` (uuid, references messages) - nullable, for direct message attachments
      - `thumbnail_path` (text) - nullable, for images
      - `created_at` (timestamptz)

  2. Storage Bucket
    - Create 'attachments' bucket if not exists
    - Public read access for public contexts
    - Private access enforced by RLS

  3. Security
    - Enable RLS on `file_attachments` table
    - Staff can manage files in their company
    - Customers can view public files related to their records

  4. Indexes
    - Index on company_id
    - Index on context
    - Index on message_id
    - Index on uploaded_by
*/

CREATE TABLE IF NOT EXISTS file_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  context_type text CHECK (context_type IN ('message', 'proposal', 'project', 'contact')),
  context_id uuid,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  thumbnail_path text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_file_attachments_company ON file_attachments(company_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_context ON file_attachments(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_message ON file_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_uploader ON file_attachments(uploaded_by);

-- Enable RLS
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for staff
CREATE POLICY "Staff can view attachments in their company"
  ON file_attachments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can upload attachments to their company"
  ON file_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete their own attachments"
  ON file_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid() AND
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for attachments bucket
CREATE POLICY "Staff can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can view attachments in their company"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete their attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE id = auth.uid()
    )
  );
