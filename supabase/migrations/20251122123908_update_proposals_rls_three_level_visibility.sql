/*
  # Update Proposals RLS for Three-Level Visibility

  1. Changes
    - Update SELECT policy to check proposal_visibility_scope enum
    - 'own': User sees only proposals they created
    - 'office': User sees proposals from their assigned office(s)
    - 'company': User sees all company proposals
    - Admins always see all proposals
  
  2. Security
    - Maintains existing admin access
    - Implements office-based filtering
    - Respects user's visibility scope setting
*/

-- Drop existing select policy
DROP POLICY IF EXISTS "Users can view proposals based on visibility setting" ON proposals;

-- Create new select policy with three-level visibility
CREATE POLICY "Users can view proposals with three-level visibility"
ON proposals
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
  AND (
    -- Admins can see everything
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
    OR
    -- Users with 'company' scope can see all company proposals
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
  )
);

-- Add comment
COMMENT ON POLICY "Users can view proposals with three-level visibility" ON proposals IS
  'Three-level visibility: own (created by me), office (my assigned offices), company (all)';
