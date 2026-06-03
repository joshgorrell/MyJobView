/*
  # Fix anonymous kiosk contact insertion - drop and recreate policy fresh

  ## Problem
  The anon INSERT policy on contacts exists and looks correct, but anonymous
  kiosk users still cannot insert contacts. The compiled policy expression
  may be stale or there may be a conflict with other policy evaluations.

  ## Fix
  Drop the existing anon INSERT policy and recreate it fresh. Also drop any
  conflicting policies that might be applying to anon role unexpectedly.
  Additionally, ensure the contacts table grants are correct.
*/

-- Drop and recreate the anon insert policy fresh
DROP POLICY IF EXISTS "Anonymous users can create contacts for kiosk and VIP" ON contacts;

-- Also check for any other policies that might inadvertently apply to anon for INSERT
-- (policies on 'public' role apply to everyone including anon)
DROP POLICY IF EXISTS "fix_anonymous_contacts_insert_policy" ON contacts;

-- Recreate with a clear, simple policy
CREATE POLICY "anon_kiosk_insert_contacts"
  ON contacts
  FOR INSERT
  TO anon
  WITH CHECK (
    email IS NOT NULL
    AND phone IS NOT NULL
    AND (contact_name IS NOT NULL OR (first_name IS NOT NULL AND last_name IS NOT NULL))
    AND organization_id IS NOT NULL
  );

-- Ensure table-level grants are in place for anon
GRANT INSERT ON contacts TO anon;
GRANT SELECT ON contacts TO anon;
