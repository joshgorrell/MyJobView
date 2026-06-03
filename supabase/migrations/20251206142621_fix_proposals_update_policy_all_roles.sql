/*
  # Fix Proposals UPDATE Policy to Include All Roles

  1. Changes
    - Update proposals UPDATE policy to allow all authenticated roles
    - Previous policy only allowed 'sales' and 'admin'
    - Now includes manager, finance, tech, service_manager roles

  2. Security
    - All authenticated users in the tenant can update proposals they have access to
    - View policy still controls which proposals users can see
    - Single-tenant system with role-based permissions
*/

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Sales can update proposals" ON proposals;

-- Create new UPDATE policy that allows all authenticated users
-- The SELECT policy already controls which proposals users can see
-- This allows any authenticated user to update proposals they can view
CREATE POLICY "Authenticated users can update proposals"
  ON proposals
  FOR UPDATE
  TO authenticated
  USING (
    -- User must be able to see the proposal (uses existing SELECT policy logic)
    -- Admins can update everything
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
    OR
    -- Users with 'company' scope can update all proposals
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND proposal_visibility_scope = 'company'
    )
    OR
    -- Users with 'office' scope can update proposals from their assigned offices
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND proposal_visibility_scope = 'office'
      )
      AND (
        office_id IS NULL
        OR
        office_id IN (
          SELECT office_id
          FROM user_offices
          WHERE user_id = auth.uid()
        )
      )
    )
    OR
    -- Users with 'own' scope can only update their own proposals
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND proposal_visibility_scope = 'own'
      )
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    -- Same check for updates
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND proposal_visibility_scope = 'company'
    )
    OR
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND proposal_visibility_scope = 'office'
      )
      AND (
        office_id IS NULL
        OR
        office_id IN (
          SELECT office_id
          FROM user_offices
          WHERE user_id = auth.uid()
        )
      )
    )
    OR
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND proposal_visibility_scope = 'own'
      )
      AND created_by = auth.uid()
    )
  );

COMMENT ON POLICY "Authenticated users can update proposals" ON proposals IS
  'Allows authenticated users to update proposals based on their visibility scope: own (created by me), office (my assigned offices), company (all)';
