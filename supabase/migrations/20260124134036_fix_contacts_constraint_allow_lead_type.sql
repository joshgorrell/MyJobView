/*
  # Fix Contacts Table Constraint - Allow 'lead' Contact Type

  1. Changes
    - Drop the existing CHECK constraint that only allows 'person' and 'business'
    - Add a new CHECK constraint that allows 'person', 'business', and 'lead'
    - This allows the kiosk to create contacts with contact_type = 'lead'

  2. Security
    - Maintains data integrity by restricting contact_type to valid values
    - Adds 'lead' as a valid contact type for tradeshow/kiosk submissions
*/

-- Drop the existing constraint
ALTER TABLE contacts
DROP CONSTRAINT IF EXISTS contacts_contact_type_check;

-- Add a new constraint that includes 'lead'
ALTER TABLE contacts
ADD CONSTRAINT contacts_contact_type_check
CHECK (contact_type IN ('person', 'business', 'lead'));
