/*
  # Fix Kiosk Contact Type to Use Person

  1. Changes
    - Update anonymous contacts policy to use 'person' instead of 'lead'
    - Kiosk leads are persons, not a separate contact type
    - The contact_type constraint only allows 'person' or 'business'

  2. Security
    - Anonymous users can only create contacts for:
      a) VIP signup (person with full address and portal access)
      b) Kiosk leads (person with basic info, no portal access)
    - All other operations still require authentication
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for VIP signup or kiosk" ON contacts;

-- Recreate with correct contact_type values
CREATE POLICY "Anonymous users can create contacts for VIP signup or kiosk"
  ON contacts FOR INSERT
  TO anon
  WITH CHECK (
    (
      -- VIP signup: person with address and portal access
      email IS NOT NULL
      AND username IS NOT NULL
      AND first_name IS NOT NULL
      AND last_name IS NOT NULL
      AND street_address IS NOT NULL
      AND city IS NOT NULL
      AND state IS NOT NULL
      AND zip_code IS NOT NULL
      AND contact_type = 'person'
      AND portal_access_enabled = true
    )
    OR
    (
      -- Kiosk lead: person with basic info (no portal access)
      email IS NOT NULL
      AND username IS NOT NULL
      AND contact_name IS NOT NULL
      AND phone IS NOT NULL
      AND contact_type = 'person'
      AND (portal_access_enabled IS NULL OR portal_access_enabled = false)
    )
  );
