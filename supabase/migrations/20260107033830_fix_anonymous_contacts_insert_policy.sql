/*
  # Fix Anonymous Contacts Insert Policy

  1. Changes
    - Remove the `full_name IS NOT NULL` check from the anonymous insert policy
    - This field is a GENERATED column and cannot be explicitly set during INSERT
    - The check is redundant since we already check for first_name and last_name

  2. Security
    - Policy remains secure by requiring all necessary fields for VIP signup
    - Anonymous users still can only create contacts, not update or delete
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for VIP signup" ON contacts;

-- Recreate without the full_name check (since it's a generated column)
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
    -- Must be a customer with portal access
    AND contact_type = 'customer'
    AND portal_access_enabled = true
  );
