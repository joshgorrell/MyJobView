/*
  # Fix Proposal Versions RLS - Use Correct Roles
  
  1. Changes
    - Update INSERT policy to use actual roles from the system
    - Include 'manager' and 'sales' roles (not 'sales_v2')
    - Allow all authenticated users to view versions (they already have access to proposals)
    
  2. Security
    - Maintains access control based on actual user roles in the system
    - Ensures users can only create versions for proposals that exist
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create proposal versions" ON proposal_versions;
DROP POLICY IF EXISTS "Users can view proposal versions" ON proposal_versions;

-- Create INSERT policy with correct roles
CREATE POLICY "Users can create proposal versions"
  ON proposal_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'manager', 'sales', 'sales_manager', 'service_manager')
    )
    AND EXISTS (
      SELECT 1 FROM proposals
      WHERE id = proposal_versions.proposal_id
    )
  );

-- Create SELECT policy - allow authenticated users who can access the proposal
CREATE POLICY "Users can view proposal versions"
  ON proposal_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE id = proposal_versions.proposal_id
    )
  );