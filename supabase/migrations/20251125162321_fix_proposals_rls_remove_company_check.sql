/*
  # Fix Proposals RLS - Remove Company ID Check
  
  1. Changes
    - Remove company_id check from proposals SELECT policy
    - This is a single-tenant system, no company_id in profiles
    - Keep three-level visibility: own, office, company
    
  2. Security
    - All authenticated users in same tenant
    - Admins see all proposals
    - Users see based on proposal_visibility_scope
*/

-- Drop existing select policy
DROP POLICY IF EXISTS "Users can view proposals with three-level visibility" ON proposals;

-- Create new select policy without company_id check
CREATE POLICY "Users can view proposals with visibility scope"
ON proposals
FOR SELECT
TO authenticated
USING (
  -- Admins can see everything
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
  OR
  -- Users with 'company' scope can see all proposals
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND proposal_visibility_scope = 'company'
  )
  OR
  -- Users with 'office' scope can see proposals from their assigned offices
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND proposal_visibility_scope = 'office'
    )
    AND (
      -- Proposal has no office_id (legacy/unassigned proposals - visible to all)
      office_id IS NULL
      OR
      -- Proposal's office matches one of user's assigned offices
      office_id IN (
        SELECT office_id
        FROM user_offices
        WHERE user_id = auth.uid()
      )
    )
  )
  OR
  -- Users with 'own' scope can only see their own proposals
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND proposal_visibility_scope = 'own'
    )
    AND created_by = auth.uid()
  )
);

-- Add comment
COMMENT ON POLICY "Users can view proposals with visibility scope" ON proposals IS
  'Three-level visibility for single-tenant: own (created by me), office (my assigned offices), company (all)';
