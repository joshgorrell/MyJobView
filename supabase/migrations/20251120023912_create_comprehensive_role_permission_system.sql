/*
  # Create Comprehensive Role-Based Permission System

  ## Overview
  Complete redesign of the permission system to support:
  1. Predefined roles (Sales, Tech, Manager, Finance, Admin)
  2. Role-level department and module access configuration
  3. User assignment to roles
  4. Per-user permission overrides beyond their role

  ## New Tables

  ### roles
  Predefined roles with metadata

  ### role_department_access
  Which departments each role can access

  ### role_module_access
  Which modules within departments each role can access

  ### user_permission_overrides
  Per-user permission overrides beyond their role

  ## Modified Tables
  - `profiles` - Add `role_id` column

  ## Security
  - Enable RLS on all tables
  - All authenticated users can view role definitions
  - Only admins can modify roles and permissions
  - Users can view their own permission overrides
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text UNIQUE NOT NULL CHECK (role_key IN ('sales', 'tech', 'manager', 'finance', 'admin')),
  display_name text NOT NULL,
  description text NOT NULL,
  is_system_role boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create role_department_access table
CREATE TABLE IF NOT EXISTS role_department_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  has_access boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role_id, department_id)
);

-- Create role_module_access table
CREATE TABLE IF NOT EXISTS role_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  has_access boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role_id, module_id)
);

-- Create user_permission_overrides table
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  override_type text NOT NULL CHECK (override_type IN ('grant', 'revoke')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_id)
);

-- Add role_id to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role_id uuid REFERENCES roles(id);
  END IF;
END $$;

-- Insert predefined roles
INSERT INTO roles (role_key, display_name, description, is_system_role, is_active)
VALUES
  ('admin', 'Administrator', 'Full system access with configuration and management capabilities', true, true),
  ('manager', 'Manager', 'Oversees operations across multiple departments with reporting access', true, true),
  ('sales', 'Sales Representative', 'Handles leads, proposals, customer relationships, and sales pipeline', true, true),
  ('tech', 'Technician', 'Field technician for installations, service calls, and project work', true, true),
  ('finance', 'Finance', 'Manages billing, invoicing, payments, and financial operations', true, true)
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_department_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view active roles" ON roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON roles;
DROP POLICY IF EXISTS "Users can view role department access" ON role_department_access;
DROP POLICY IF EXISTS "Admins can manage role department access" ON role_department_access;
DROP POLICY IF EXISTS "Users can view role module access" ON role_module_access;
DROP POLICY IF EXISTS "Admins can manage role module access" ON role_module_access;
DROP POLICY IF EXISTS "Users can view own permission overrides" ON user_permission_overrides;
DROP POLICY IF EXISTS "Admins can view all permission overrides" ON user_permission_overrides;
DROP POLICY IF EXISTS "Admins can manage permission overrides" ON user_permission_overrides;
DROP POLICY IF EXISTS "Admins can update permission overrides" ON user_permission_overrides;
DROP POLICY IF EXISTS "Admins can delete permission overrides" ON user_permission_overrides;

-- RLS Policies for roles
CREATE POLICY "Users can view active roles"
  ON roles
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage roles"
  ON roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for role_department_access
CREATE POLICY "Users can view role department access"
  ON role_department_access
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage role department access"
  ON role_department_access
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for role_module_access
CREATE POLICY "Users can view role module access"
  ON role_module_access
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage role module access"
  ON role_module_access
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for user_permission_overrides
CREATE POLICY "Users can view own permission overrides"
  ON user_permission_overrides
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all permission overrides"
  ON user_permission_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage permission overrides"
  ON user_permission_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update permission overrides"
  ON user_permission_overrides
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete permission overrides"
  ON user_permission_overrides
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_roles_role_key ON roles(role_key);
CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles(is_active);
CREATE INDEX IF NOT EXISTS idx_role_department_access_role ON role_department_access(role_id);
CREATE INDEX IF NOT EXISTS idx_role_department_access_dept ON role_department_access(department_id);
CREATE INDEX IF NOT EXISTS idx_role_module_access_role ON role_module_access(role_id);
CREATE INDEX IF NOT EXISTS idx_role_module_access_module ON role_module_access(module_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_module ON user_permission_overrides(module_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Create helper function to get user's effective permissions
CREATE OR REPLACE FUNCTION get_user_module_access(p_user_id uuid, p_module_id uuid)
RETURNS boolean AS $$
DECLARE
  v_role_id uuid;
  v_has_role_access boolean;
  v_override_type text;
BEGIN
  -- Get user's role
  SELECT role_id INTO v_role_id
  FROM profiles
  WHERE id = p_user_id;

  -- If no role assigned, no access
  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check for user-specific override first
  SELECT override_type INTO v_override_type
  FROM user_permission_overrides
  WHERE user_id = p_user_id
  AND module_id = p_module_id;

  -- If override exists, apply it
  IF FOUND THEN
    IF v_override_type = 'grant' THEN
      RETURN true;
    ELSIF v_override_type = 'revoke' THEN
      RETURN false;
    END IF;
  END IF;

  -- No override, check role-based access
  SELECT has_access INTO v_has_role_access
  FROM role_module_access
  WHERE role_id = v_role_id
  AND module_id = p_module_id;

  -- Return role-based access (defaults to false if not found)
  RETURN COALESCE(v_has_role_access, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get user's accessible modules
CREATE OR REPLACE FUNCTION get_user_accessible_modules(p_user_id uuid)
RETURNS TABLE (
  module_id uuid,
  module_key text,
  display_name text,
  department_id uuid,
  has_access boolean,
  access_source text
) AS $$
BEGIN
  RETURN QUERY
  WITH user_role AS (
    SELECT role_id FROM profiles WHERE id = p_user_id
  ),
  role_modules AS (
    SELECT
      dm.id as module_id,
      dm.module_key,
      dm.display_name,
      dm.department_id,
      COALESCE(rma.has_access, false) as has_access,
      'role' as access_source
    FROM department_modules dm
    LEFT JOIN role_module_access rma ON rma.module_id = dm.id
    CROSS JOIN user_role
    WHERE rma.role_id = user_role.role_id
    AND dm.is_active = true
  ),
  override_modules AS (
    SELECT
      dm.id as module_id,
      dm.module_key,
      dm.display_name,
      dm.department_id,
      CASE
        WHEN upo.override_type = 'grant' THEN true
        WHEN upo.override_type = 'revoke' THEN false
      END as has_access,
      'override' as access_source
    FROM user_permission_overrides upo
    JOIN department_modules dm ON dm.id = upo.module_id
    WHERE upo.user_id = p_user_id
    AND dm.is_active = true
  )
  SELECT
    COALESCE(om.module_id, rm.module_id) as module_id,
    COALESCE(om.module_key, rm.module_key) as module_key,
    COALESCE(om.display_name, rm.display_name) as display_name,
    COALESCE(om.department_id, rm.department_id) as department_id,
    COALESCE(om.has_access, rm.has_access, false) as has_access,
    COALESCE(om.access_source, rm.access_source, 'none') as access_source
  FROM role_modules rm
  FULL OUTER JOIN override_modules om ON om.module_id = rm.module_id
  WHERE COALESCE(om.has_access, rm.has_access, false) = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_role_department_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_role_module_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_permission_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_roles_updated_at();

DROP TRIGGER IF EXISTS update_role_department_access_updated_at ON role_department_access;
CREATE TRIGGER update_role_department_access_updated_at
  BEFORE UPDATE ON role_department_access
  FOR EACH ROW
  EXECUTE FUNCTION update_role_department_access_updated_at();

DROP TRIGGER IF EXISTS update_role_module_access_updated_at ON role_module_access;
CREATE TRIGGER update_role_module_access_updated_at
  BEFORE UPDATE ON role_module_access
  FOR EACH ROW
  EXECUTE FUNCTION update_role_module_access_updated_at();

DROP TRIGGER IF EXISTS update_user_permission_overrides_updated_at ON user_permission_overrides;
CREATE TRIGGER update_user_permission_overrides_updated_at
  BEFORE UPDATE ON user_permission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_user_permission_overrides_updated_at();
