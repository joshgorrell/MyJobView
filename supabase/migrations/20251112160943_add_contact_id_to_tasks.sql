/*
  # Add Contact Relationship to Tasks

  1. Changes
    - Add `contact_id` column to tasks table (uuid, references contacts)
    - Tasks can now be associated with either a lead OR a contact (or neither)
    - Add index for efficient lookups

  2. Purpose
    - Allow tasks to be linked directly to contacts from the contacts module
    - Provides more flexibility in task management
    - Supports workflow where contacts aren't necessarily leads
*/

-- Add contact_id column to tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);