/*
  # Update Proposals RLS to Respect Visibility Setting

  1. Changes
    - Update SELECT policy to check can_see_all_proposals setting
    - If true, user sees all company proposals
    - If false, user only sees proposals they created
    - Admins always see all proposals
  
  2. Security
    - Maintains existing admin access
    - Restricts non-admin users based on their visibility setting
*/

-- Drop existing select policy
DROP POLICY IF EXISTS "Users can view proposals with role check" ON proposals;

-- Create new select policy with visibility check
CREATE POLICY "Users can view proposals based on visibility setting"
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
    -- Users with can_see_all_proposals = true can see all company proposals
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND can_see_all_proposals = true
    )
    OR
    -- Users with can_see_all_proposals = false only see their own proposals
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND can_see_all_proposals = false
      )
      AND created_by = auth.uid()
    )
  )
);
