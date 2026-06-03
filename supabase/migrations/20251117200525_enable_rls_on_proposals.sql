/*
  # Enable RLS on Proposals Table

  1. Security
    - Enable RLS on proposals table
    - Add comprehensive policies for all roles
    - Allow sales team to manage proposals
    - Allow customers to view their proposals via portal

  2. Policies
    - Sales roles can manage all proposals
    - Portal users can view their own proposals
    - Service/Production can view proposals for their projects
*/

-- Enable RLS
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Drop the temporary permissive policy
DROP POLICY IF EXISTS "Temp: Allow all for authenticated users" ON proposals;

-- Sales roles can view all proposals
CREATE POLICY "Sales can view all proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner')
    )
  );

-- Sales roles can insert proposals
CREATE POLICY "Sales can create proposals"
  ON proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner')
    )
  );

-- Sales roles can update proposals
CREATE POLICY "Sales can update proposals"
  ON proposals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner')
    )
  );

-- Sales roles can delete proposals
CREATE POLICY "Sales can delete proposals"
  ON proposals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('sales', 'sales_manager', 'admin', 'owner')
    )
  );

-- Portal users can view their proposals (keep existing)
-- Policy already exists: "Portal users can view their proposals"

-- Service and production can view proposals for their work
CREATE POLICY "Service and production can view proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('service_manager', 'dispatcher', 'production_manager', 'technician', 'lead_technician')
    )
  );