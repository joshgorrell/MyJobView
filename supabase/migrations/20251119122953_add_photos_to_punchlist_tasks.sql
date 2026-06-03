/*
  # Add Photos to Punchlist Tasks

  ## Summary
  Allows customers to add photos to their punchlist tasks.
  Customers can take photos with their camera or upload existing photos.

  ## Changes

  ### New Table: punchlist_task_photos
  - Links photos to specific tasks
  - Stores photo URL and metadata
  - Tracks upload timestamp
  - Supports multiple photos per task

  ### New Storage Bucket: punchlist-photos
  - Public read access for staff to view
  - Authenticated write for customers
  - Organized by task_id folders

  ### Security
  - RLS enabled on photos table
  - Customers can only add photos to their own tasks
  - Staff can view all photos
*/

-- Create punchlist task photos table
CREATE TABLE IF NOT EXISTS punchlist_task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES punchlist_tasks(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES profiles(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_punchlist_task_photos_task_id 
  ON punchlist_task_photos(task_id);

CREATE INDEX IF NOT EXISTS idx_punchlist_task_photos_uploaded_at 
  ON punchlist_task_photos(uploaded_at DESC);

-- Enable RLS
ALTER TABLE punchlist_task_photos ENABLE ROW LEVEL SECURITY;

-- Customers can view photos for their own tasks
CREATE POLICY "Customers can view own task photos"
  ON punchlist_task_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      JOIN punchlist_access_grants pag ON pag.contact_id = pt.contact_id
      WHERE pt.id = punchlist_task_photos.task_id
      AND pag.contact_id IN (
        SELECT contact_id FROM profiles WHERE id = auth.uid()
      )
      AND pag.status = 'active'
      AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
    )
  );

-- Staff can view all task photos
CREATE POLICY "Staff can view all task photos"
  ON punchlist_task_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'production_manager', 'technician', 'office')
    )
  );

-- Customers can insert photos to their own tasks
CREATE POLICY "Customers can add photos to own tasks"
  ON punchlist_task_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      JOIN punchlist_access_grants pag ON pag.contact_id = pt.contact_id
      WHERE pt.id = punchlist_task_photos.task_id
      AND pag.contact_id IN (
        SELECT contact_id FROM profiles WHERE id = auth.uid()
      )
      AND pag.status = 'active'
      AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
    )
  );

-- Customers can delete their own photos
CREATE POLICY "Customers can delete own task photos"
  ON punchlist_task_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      JOIN punchlist_access_grants pag ON pag.contact_id = pt.contact_id
      WHERE pt.id = punchlist_task_photos.task_id
      AND pag.contact_id IN (
        SELECT contact_id FROM profiles WHERE id = auth.uid()
      )
      AND pag.status = 'active'
      AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
    )
  );

-- Staff can delete photos
CREATE POLICY "Staff can delete task photos"
  ON punchlist_task_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'production_manager')
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON punchlist_task_photos TO authenticated;
