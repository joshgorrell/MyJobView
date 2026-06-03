/*
  # Fix Kiosk Anonymous Contact Creation

  1. Changes
    - Update anonymous contacts policy to properly support kiosk lead creation
    - Require username for both VIP signup and kiosk leads
    - Simplify checks for kiosk leads to only require basic fields

  2. Security
    - Anonymous users can only create contacts for:
      a) VIP signup (person with full address and portal access)
      b) Kiosk leads (lead contact type with name, email, phone, username)
    - All other operations still require authentication
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for VIP signup or kiosk" ON contacts;

-- Recreate to allow both VIP signup and kiosk leads
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
      -- Kiosk lead: lead contact type with basic info
      email IS NOT NULL
      AND username IS NOT NULL
      AND contact_name IS NOT NULL
      AND phone IS NOT NULL
      AND contact_type = 'lead'
    )
  );
