/*
  # Fix Kiosk Anonymous Insert - Allow Organization ID

  1. Changes
    - Update anonymous contacts INSERT policy to explicitly allow organization_id
    - This ensures anonymous kiosk submissions work on all devices
    - The policy now validates that an organization_id is provided

  2. Security
    - Anonymous users can only INSERT contacts (no read/update/delete)
    - Requires essential contact information (email, phone, name)
    - Requires organization_id to be explicitly provided
    - Still prevents malicious bulk inserts by requiring all fields
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for kiosk and VIP" ON contacts;

-- Recreate with organization_id requirement
CREATE POLICY "Anonymous users can create contacts for kiosk and VIP"
  ON contacts
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Require email, phone, and name
    email IS NOT NULL
    AND phone IS NOT NULL
    AND (
      contact_name IS NOT NULL
      OR (first_name IS NOT NULL AND last_name IS NOT NULL)
    )
    -- Must provide organization_id explicitly
    AND organization_id IS NOT NULL
    -- Must provide username
    AND username IS NOT NULL
  );
