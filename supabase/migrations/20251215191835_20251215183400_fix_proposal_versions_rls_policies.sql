/*
  # Fix Proposal Versions RLS Policies
  
  1. Changes
    - Simplify proposal_versions RLS policies to actually work
    - Wrap auth.uid() in SELECT for performance
    - Remove overly complex visibility checks that reference non-existent fields
    - Allow authenticated users with appropriate roles to create versions
    
  2. Security
    - Maintains access control based on user roles
    - Ensures users can only create versions for proposals they can access
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create proposal versions" ON proposal_versions;
DROP POLICY IF EXISTS "Users can view proposal versions" ON proposal_versions;

-- Create simplified INSERT policy
CREATE POLICY "Users can create proposal versions"
  ON proposal_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'sales_v2', 'sales_manager', 'service_manager')
    )
    AND EXISTS (
      SELECT 1 FROM proposals
      WHERE id = proposal_versions.proposal_id
    )
  );

-- Create simplified SELECT policy
CREATE POLICY "Users can view proposal versions"
  ON proposal_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'sales_v2', 'sales_manager', 'service_manager', 'technician', 'dispatcher', 'production_manager', 'warehouse_manager', 'finance_manager', 'portal_user')
    )
    AND EXISTS (
      SELECT 1 FROM proposals
      WHERE id = proposal_versions.proposal_id
    )
  );