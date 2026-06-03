/*
  # Add Contact Type to Contacts

  1. Changes
    - Add `contact_type` column to contacts table with values 'person' or 'business'
    - Defaults to 'person' for backward compatibility
    - Update existing records to set appropriate contact_type based on data

  2. Notes
    - For person contacts: name (first_name + last_name) is required
    - For business contacts: company_name is required
    - This enables better organization and validation of contacts
*/

-- Add contact_type column
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'person' CHECK (contact_type IN ('person', 'business'));

-- Set contact_type for existing records based on data
-- If company_name is the primary identifier (no first/last name), treat as business
UPDATE contacts
SET contact_type = 'business'
WHERE company_name IS NOT NULL
  AND company_name != ''
  AND (first_name IS NULL OR first_name = '')
  AND (last_name IS NULL OR last_name = '');

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts(contact_type);
