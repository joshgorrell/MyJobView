/*
  # Update Lead Visibility Policies

  1. Changes
    - Update RLS policies for leads table
    - Sales reps can only see:
      - Leads assigned to them
      - Leads in the fishbowl (unclaimed)
    - Sales reps CANNOT see leads assigned to other sales reps
    - Admins and managers (bd role) can see all leads

  2. Security
    - Maintains data privacy between sales reps
    - Admins and BD have full visibility for management purposes
*/

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view leads they created or assigned to them" ON leads;

-- Create new SELECT policy with manager role support
CREATE POLICY "Sales reps see their leads and fishbowl, admins see all"
  ON leads FOR SELECT
  TO authenticated
  USING (
    -- User is assigned to the lead
    assigned_to = auth.uid()
    -- OR lead is in fishbowl (available to claim)
    OR is_fishbowl = true
    -- OR user is admin or manager (bd)
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'bd')
    )
  );