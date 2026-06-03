/*
  # Fix Proposal Versions RLS Policies (Single Tenant)

  ## Problem
  The RLS policies for proposal_versions were incorrectly referencing
  non-existent company_id columns in profiles table.
  
  This is a single-tenant system where all authenticated users should
  have access to all proposal versions.

  ## Solution
  Simplify the policies to just check authentication.
  
  ## Changes
  - Drop and recreate SELECT policy for authenticated users
  - Drop and recreate INSERT policy for authenticated users
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view proposal versions in their company" ON proposal_versions;
DROP POLICY IF EXISTS "Staff can create proposal versions in their company" ON proposal_versions;
DROP POLICY IF EXISTS "Users can view proposal versions" ON proposal_versions;
DROP POLICY IF EXISTS "Users can create proposal versions" ON proposal_versions;

-- Create correct SELECT policy (all authenticated users can view)
CREATE POLICY "Authenticated users can view proposal versions"
  ON proposal_versions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Create correct INSERT policy (all authenticated users can create)
CREATE POLICY "Authenticated users can create proposal versions"
  ON proposal_versions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
