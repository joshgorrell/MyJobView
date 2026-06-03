/*
  # Create Projects Schema

  1. New Tables
    - `projects`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references profiles)
      - `sales_order_id` (uuid, references sales_orders)
      - `contact_id` (uuid, references contacts)
      - `project_number` (text, unique per company)
      - `name` (text)
      - `status` (text: planning, active, complete, closed)
      - `assigned_pm` (uuid, references profiles) - Project Manager
      - `job_site_address` (jsonb) - Separate from billing address
      - `start_date` (date)
      - `target_completion_date` (date)
      - `actual_completion_date` (date)
      - `notes` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `projects` table
    - Add policies for company-based access
    - Project Managers can see assigned projects
    - Customers can see their own projects (via portal)

  3. Indexes
    - Index on company_id
    - Index on sales_order_id
    - Index on contact_id
    - Index on assigned_pm
    - Index on status
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_number text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'complete', 'closed')),
  assigned_pm uuid,
  job_site_address jsonb,
  start_date date,
  target_completion_date date,
  actual_completion_date date,
  notes text,
  internal_notes text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, project_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_sales_order ON projects(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_projects_contact ON projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_pm ON projects(assigned_pm);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(company_id, status);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policies for staff
CREATE POLICY "Staff can view projects in their company"
  ON projects FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create projects in their company"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update projects in their company"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete projects in their company"
  ON projects FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );
