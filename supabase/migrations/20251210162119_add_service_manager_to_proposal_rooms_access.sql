/*
  # Add Service Manager Access to Proposal Rooms

  ## Summary
  Service managers need to view proposal rooms (areas) to properly see proposal details.
  Currently they can see line items but not the room/area structure.

  ## Changes Made

  1. **Update proposal_rooms SELECT Policy**
     - Add 'service_manager' to the list of roles that can view rooms
     - Now allows: sales, admin, finance, tech, service_manager

  2. **Update proposal_rooms INSERT Policy**
     - Add 'service_manager' to allow creating rooms if needed

  3. **Update proposal_rooms UPDATE Policy**
     - Add 'service_manager' to allow updating rooms

  4. **Update proposal_rooms DELETE Policy**
     - Add 'service_manager' to allow deleting rooms

  ## Security Notes
  - Service managers need full proposal access to manage service-related work
  - This aligns with their role in overseeing service operations
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can insert proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can update proposal rooms" ON proposal_rooms;
DROP POLICY IF EXISTS "Users can delete proposal rooms" ON proposal_rooms;

-- Recreate with service_manager included
CREATE POLICY "Users can view proposal rooms"
  ON proposal_rooms
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'finance', 'tech', 'service_manager'])
  );

CREATE POLICY "Users can insert proposal rooms"
  ON proposal_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );

CREATE POLICY "Users can update proposal rooms"
  ON proposal_rooms
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );

CREATE POLICY "Users can delete proposal rooms"
  ON proposal_rooms
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = ANY(ARRAY['sales', 'admin', 'service_manager'])
  );
