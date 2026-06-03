/*
  # Make lead_id optional in tasks table

  1. Changes
    - Remove NOT NULL constraint from lead_id in tasks table
    - This allows tasks to be created for contacts without leads
    - Tasks can now be associated with either a lead or just a contact

  2. Notes
    - Existing tasks with lead_id will remain unchanged
    - New tasks can be created with contact_id only
*/

-- Make lead_id optional
ALTER TABLE tasks ALTER COLUMN lead_id DROP NOT NULL;