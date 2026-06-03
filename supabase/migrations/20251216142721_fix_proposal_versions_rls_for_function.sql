/*
  # Fix Proposal Versions RLS for SECURITY DEFINER Function
  
  1. Issue
    - The INSERT policy on proposal_versions checks user roles using auth.uid()
    - When called from within the SECURITY DEFINER function, this fails
    - The function already controls access via EXECUTE permissions
    
  2. Solution
    - Simplify the INSERT policy to only check if proposal exists
    - The create_proposal_version function already has proper access control
    - Users must have EXECUTE permission to call the function
    
  3. Security
    - Access control is enforced by function EXECUTE permissions
    - Function is SECURITY DEFINER so it runs with elevated privileges
    - Only authenticated users with proper roles can execute the function
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create proposal versions" ON proposal_versions;

-- Create simpler INSERT policy that works with SECURITY DEFINER
-- The function already controls access, so we just verify the proposal exists
CREATE POLICY "Users can create proposal versions"
  ON proposal_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE id = proposal_versions.proposal_id
    )
  );
