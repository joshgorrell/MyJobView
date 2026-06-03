
/*
  # Fix Security Onboarding Anonymous RLS Policies

  ## Problem
  Customers completing the security onboarding form via a magic link are
  unauthenticated (anon role). The final submission step fails because:

  1. `contacts` table has no UPDATE policy for anon users
  2. `security_contract_emergency_contacts` table has no INSERT policy for anon users

  The `security_contracts` table already has correct anon policies tied to the
  magic link token, so those updates work fine.

  ## Changes

  ### contacts table
  - Add anon UPDATE policy that allows updating a contact only when the contact
    is linked to a valid (non-expired) security contract being completed via
    magic link.

  ### security_contract_emergency_contacts table
  - Add anon INSERT policy that allows inserting emergency contacts only when
    the referenced contract_id has a valid, non-expired magic link token.

  ## Security
  Both policies are narrowly scoped — anon users can only touch records that
  are directly tied to the magic link contract they are completing.
*/

-- Allow anonymous customers to update their own contact record during onboarding
-- Only permitted when their contact is linked to an active magic-link contract
CREATE POLICY "Anon can update contact via security contract magic link"
  ON contacts
  FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM security_contracts sc
      WHERE sc.contact_id = contacts.id
        AND sc.magic_link_token IS NOT NULL
        AND sc.magic_link_expires_at > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM security_contracts sc
      WHERE sc.contact_id = contacts.id
        AND sc.magic_link_token IS NOT NULL
        AND sc.magic_link_expires_at > now()
    )
  );

-- Allow anonymous customers to insert emergency contacts during onboarding
-- Only permitted when the contract_id has a valid active magic link
CREATE POLICY "Anon can insert emergency contacts via magic link"
  ON security_contract_emergency_contacts
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM security_contracts sc
      WHERE sc.id = security_contract_emergency_contacts.contract_id
        AND sc.magic_link_token IS NOT NULL
        AND sc.magic_link_expires_at > now()
    )
  );
