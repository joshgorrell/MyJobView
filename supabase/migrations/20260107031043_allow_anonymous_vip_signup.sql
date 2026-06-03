/*
  # Allow Anonymous VIP Signup

  1. Changes
    - Allow anonymous users to create contacts for VIP self-service signup
    - Restricts anonymous inserts to only include required fields for VIP signup
    - Ensures portal_access_enabled is true for VIP signups

  2. Security
    - Anonymous users can only create contacts, not update or delete
    - All other operations still require authentication
*/

-- Allow anonymous users to create contacts for VIP signup
CREATE POLICY "Anonymous users can create contacts for VIP signup"
  ON contacts FOR INSERT
  TO anon
  WITH CHECK (
    -- Must have email, name, and address
    email IS NOT NULL
    AND full_name IS NOT NULL
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
