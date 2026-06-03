/*
  # Add Service Manager Access to Proposal Line Items

  ## Summary
  Service managers need to view proposal line items to properly see proposal details.
  Currently they can see the proposal headers but not the line items, making proposals
  appear blank.

  ## Changes Made

  1. **Update proposal_line_items SELECT Policy**
     - Add 'service_manager' to the list of roles that can view line items
     - Now allows: sales, admin, finance, tech, service_manager

  2. **Update proposal_line_items INSERT Policy**
     - Add 'service_manager' to allow creating line items if needed

  3. **Update proposal_line_items UPDATE Policy**
     - Add 'service_manager' to allow updating line items

  4. **Update proposal_line_items DELETE Policy**
     - Add 'service_manager' to allow deleting line items

  ## Security Notes
  - Service managers need full proposal access to manage service-related work
  - This aligns with their role in overseeing service operations
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can insert proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can update proposal line items" ON proposal_line_items;
DROP POLICY IF EXISTS "Users can delete proposal line items" ON proposal_line_items;

-- Recreate with service_manager included
CREATE POLICY "Users can view proposal line items"
  ON proposal_line_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'finance', 'tech', 'service_manager'])
  );

CREATE POLICY "Users can insert proposal line items"
  ON proposal_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );

CREATE POLICY "Users can update proposal line items"
  ON proposal_line_items
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );

CREATE POLICY "Users can delete proposal line items"
  ON proposal_line_items
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );
