/*
  # Temporarily Permissive Proposals Policy
  
  ## Summary
  Creates a very permissive policy for debugging to identify the exact permission issue.
  
  ## Changes
  - Temporarily allows all operations on proposals for authenticated users
  
  ## Notes
  - This is for debugging only
  - Will be replaced with proper restrictive policies once issue is identified
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert company proposals" ON proposals;
DROP POLICY IF EXISTS "Users can view proposals based on office visibility" ON proposals;
DROP POLICY IF EXISTS "Users can update company proposals" ON proposals;
DROP POLICY IF EXISTS "Users can delete company proposals" ON proposals;

-- Create temporary permissive policies
CREATE POLICY "Temp: Allow all for authenticated users"
  ON proposals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
