/*
  # Contact Import Batch System

  ## Overview
  Adds infrastructure to support bulk CSV imports of contacts with full
  audit trail and rollback capability.

  ## New Tables
  - `contact_import_batches` - Tracks each CSV import session
    - `id` (uuid, primary key)
    - `organization_id` (uuid, FK to organizations)
    - `imported_by` (uuid, FK to profiles)
    - `file_name` (text) - original filename
    - `row_count` (int) - total rows imported
    - `skipped_count` (int) - duplicates skipped
    - `error_count` (int) - rows with errors
    - `status` (text) - pending/completed/rolled_back
    - `imported_at` (timestamptz)

  ## Modified Tables
  - `contacts` - adds nullable `import_batch_id` (text) column for rollback support

  ## Security
  - RLS enabled on contact_import_batches
  - Admin-only access for creating and managing batches
  - Authenticated users can read batches for their organization
*/

CREATE TABLE IF NOT EXISTS contact_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  imported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  imported_by_name text,
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'rolled_back')),
  imported_at timestamptz DEFAULT now()
);

ALTER TABLE contact_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view batches for their org"
  ON contact_import_batches FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert import batches"
  ON contact_import_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update import batches"
  ON contact_import_batches FOR UPDATE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete import batches"
  ON contact_import_batches FOR DELETE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE INDEX IF NOT EXISTS idx_contact_import_batches_org_id ON contact_import_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_import_batches_imported_by ON contact_import_batches(imported_by);
CREATE INDEX IF NOT EXISTS idx_contact_import_batches_imported_at ON contact_import_batches(imported_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'import_batch_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN import_batch_id uuid REFERENCES contact_import_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_import_batch_id ON contacts(import_batch_id);
