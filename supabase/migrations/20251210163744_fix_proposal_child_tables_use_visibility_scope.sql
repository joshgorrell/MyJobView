/*
  # Fix Proposal Child Tables to Use Visibility Scope

  ## Summary
  If a user can view a proposal, they should be able to view ALL related data (line items, rooms, etc).
  Currently these tables use role-based restrictions which can block users who have proposal access
  via visibility scope.

  ## Changes Made

  1. **Update proposal_line_items SELECT Policy**
     - Change from role-based to proposal-access-based
     - If user can view the parent proposal, they can view its line items

  2. **Update proposal_rooms SELECT Policy**
     - Change from role-based to proposal-access-based
     - If user can view the parent proposal, they can view its rooms

  3. **Update proposal_settings SELECT Policy**
     - Simplify to check proposal access directly

  ## Security Notes
  - Users can only view child records if they can view the parent proposal
  - Proposal visibility is controlled by the main proposals table RLS
  - This creates a consistent security model across all proposal tables
*/

-- Drop existing SELECT policies for child tables
DROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can view proposal settings from their company" ON proposal_settings;

-- Recreate with proposal-access-based logic
CREATE POLICY "Users can view proposal line items"
  ON proposal_line_items
  FOR SELECT
  TO authenticated
  USING (
    -- If user can view the proposal, they can view its line items
    proposal_id IN (
      SELECT id FROM proposals
      WHERE 
        -- Check via the main proposals RLS policies
        (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
              p.role = 'admin'
              OR p.proposal_visibility_scope = 'company'
              OR (
                p.proposal_visibility_scope = 'office'
                AND (
                  proposals.office_id IS NULL
                  OR proposals.office_id IN (
                    SELECT office_id FROM user_offices WHERE user_id = auth.uid()
                  )
                )
              )
              OR (
                p.proposal_visibility_scope = 'own'
                AND proposals.created_by = auth.uid()
              )
            )
          )
        )
    )
  );

CREATE POLICY "Users can view proposal rooms"
  ON proposal_rooms
  FOR SELECT
  TO authenticated
  USING (
    -- If user can view the proposal, they can view its rooms
    proposal_id IN (
      SELECT id FROM proposals
      WHERE 
        (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
              p.role = 'admin'
              OR p.proposal_visibility_scope = 'company'
              OR (
                p.proposal_visibility_scope = 'office'
                AND (
                  proposals.office_id IS NULL
                  OR proposals.office_id IN (
                    SELECT office_id FROM user_offices WHERE user_id = auth.uid()
                  )
                )
              )
              OR (
                p.proposal_visibility_scope = 'own'
                AND proposals.created_by = auth.uid()
              )
            )
          )
        )
    )
  );

CREATE POLICY "Users can view proposal settings from their company"
  ON proposal_settings
  FOR SELECT
  TO authenticated
  USING (
    -- If user can view the proposal, they can view its settings
    proposal_id IN (
      SELECT id FROM proposals
      WHERE 
        (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
              p.role = 'admin'
              OR p.proposal_visibility_scope = 'company'
              OR (
                p.proposal_visibility_scope = 'office'
                AND (
                  proposals.office_id IS NULL
                  OR proposals.office_id IN (
                    SELECT office_id FROM user_offices WHERE user_id = auth.uid()
                  )
                )
              )
              OR (
                p.proposal_visibility_scope = 'own'
                AND proposals.created_by = auth.uid()
              )
            )
          )
        )
    )
  );
