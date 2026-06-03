/*
  # Add full_name Column to Contacts

  1. Changes
    - Add full_name as a generated column that concatenates first_name and last_name
    - Falls back to contact_name if first_name and last_name are not set
    - This maintains backward compatibility with all existing queries

  2. Notes
    - Generated column is automatically computed from first_name and last_name
    - No migration of existing data needed
*/

-- Add full_name as a generated column
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS full_name TEXT 
GENERATED ALWAYS AS (
  CASE
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL 
    THEN first_name || ' ' || last_name
    WHEN first_name IS NOT NULL 
    THEN first_name
    WHEN last_name IS NOT NULL 
    THEN last_name
    ELSE contact_name
  END
) STORED;