/*
  # Add Contact and Project Information to Job Photos

  1. Changes
    - Add `contact_id` column to `job_photos` table (optional)
    - Add `project_id` column to `job_photos` table (optional)
    - Make `work_order_id` nullable (since photos can now be standalone)
    - Add indexes for better query performance

  2. Notes
    - Photos can now be linked to contacts and projects
    - All fields are optional - users can add this info later
*/

-- Add contact_id and project_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_photos' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE job_photos
    ADD COLUMN contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_photos' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE job_photos
    ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Make work_order_id nullable
ALTER TABLE job_photos ALTER COLUMN work_order_id DROP NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_photos_contact_id ON job_photos(contact_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_project_id ON job_photos(project_id);

-- Update RLS policies to allow viewing photos
DROP POLICY IF EXISTS "Users can view job photos" ON job_photos;
CREATE POLICY "Users can view job photos"
  ON job_photos FOR SELECT
  TO authenticated
  USING (true);
