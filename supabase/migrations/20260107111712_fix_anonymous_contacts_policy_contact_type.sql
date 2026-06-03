/*
  # Fix Anonymous Contacts Insert Policy - Contact Type

  1. Changes
    - Update the contact_type check from 'customer' to 'person'
    - The contacts table only allows 'person' or 'business' as valid contact types

  2. Security
    - Policy remains secure by requiring all necessary fields for VIP signup
    - Anonymous users still can only create contacts, not update or delete
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for VIP signup" ON contacts;

-- Recreate with correct contact_type value
CREATE POLICY "Anonymous users can create contacts for VIP signup"
  ON contacts FOR INSERT
  TO anon
  WITH CHECK (
    -- Must have email, name, and address
    email IS NOT NULL
    AND first_name IS NOT NULL
    AND last_name IS NOT NULL
    AND street_address IS NOT NULL
    AND city IS NOT NULL
    AND state IS NOT NULL
    AND zip_code IS NOT NULL
    -- Must be a person with portal access
    AND contact_type = 'person'
    AND portal_access_enabled = true
  );
