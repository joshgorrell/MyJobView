/*
  # Fix Labor Phases RLS - Single Tenant Access
  
  1. Problem
    - Labor phases have company_id but RLS only checks is_active
    - Users can't see labor phases in dropdowns
    - This is a single-tenant system
  
  2. Solution
    - Update SELECT policy to allow all authenticated users to see active phases
    - Remove restrictive company filtering since this is single-tenant
*/

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view active labor phases" ON labor_phases;

-- Create new policy allowing all authenticated users to see active labor phases
CREATE POLICY "All users can view active labor phases"
  ON labor_phases
  FOR SELECT
  TO authenticated
  USING (is_active = true);
