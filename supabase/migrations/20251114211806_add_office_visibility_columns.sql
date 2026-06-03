/*
  # Add Office Visibility Columns
  
  ## Summary
  Adds columns needed for office-based visibility controls.
*/

-- Add primary_office_id to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;

-- Create user_visibility_settings table
CREATE TABLE IF NOT EXISTS user_visibility_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visibility_scope text NOT NULL DEFAULT 'all_offices' CHECK (visibility_scope IN ('own_only', 'office_only', 'selected_offices', 'all_offices')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_visibility_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own visibility settings"
  ON user_visibility_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own visibility settings"
  ON user_visibility_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own visibility settings"
  ON user_visibility_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage visibility settings"
  ON user_visibility_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Add office_id columns
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;

-- Add created_by columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_primary_office ON profiles(primary_office_id);
CREATE INDEX IF NOT EXISTS idx_proposals_office_id ON proposals(office_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_office_id ON projects(office_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_office_id ON invoices(office_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
