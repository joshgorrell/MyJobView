/*
  # Complete Department Structure System
  
  Adds missing tables and functions for department-based access control
*/

-- Department Access Table (if not exists)
CREATE TABLE IF NOT EXISTS department_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
  has_access boolean DEFAULT true,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now(),
  notes text,
  
  UNIQUE(user_id, department_id)
);

-- Module Access Table (if not exists)
CREATE TABLE IF NOT EXISTS module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  module_id uuid REFERENCES department_modules(id) ON DELETE CASCADE NOT NULL,
  has_access boolean DEFAULT true,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now(),
  notes text,
  
  UNIQUE(user_id, module_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_department_access_user ON department_access(user_id);
CREATE INDEX IF NOT EXISTS idx_department_access_dept ON department_access(department_id);
CREATE INDEX IF NOT EXISTS idx_department_access_has_access ON department_access(has_access);
CREATE INDEX IF NOT EXISTS idx_module_access_user ON module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_module_access_module ON module_access(module_id);
CREATE INDEX IF NOT EXISTS idx_module_access_has_access ON module_access(has_access);

-- Enable RLS
ALTER TABLE department_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for department_access
CREATE POLICY "Users can view their own department access"
  ON department_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all department access"
  ON department_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage department access"
  ON department_access FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for module_access
CREATE POLICY "Users can view their own module access"
  ON module_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all module access"
  ON module_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage module access"
  ON module_access FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to check if user has access to a module
CREATE OR REPLACE FUNCTION user_has_module_access(
  p_user_id uuid,
  p_module_key text
)
RETURNS boolean AS $$
DECLARE
  v_module_id uuid;
  v_department_id uuid;
  v_has_dept_access boolean;
  v_has_module_access boolean;
  v_user_role text;
BEGIN
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
  
  IF v_user_role = 'admin' THEN RETURN true; END IF;
  
  SELECT dm.id, dm.department_id INTO v_module_id, v_department_id
  FROM department_modules dm WHERE dm.module_key = p_module_key AND dm.is_enabled = true;
  
  IF v_module_id IS NULL THEN RETURN false; END IF;
  
  SELECT COALESCE(has_access, true) INTO v_has_dept_access
  FROM department_access WHERE user_id = p_user_id AND department_id = v_department_id;
  
  IF v_has_dept_access = false THEN RETURN false; END IF;
  
  SELECT COALESCE(has_access, true) INTO v_has_module_access
  FROM module_access WHERE user_id = p_user_id AND module_id = v_module_id;
  
  RETURN COALESCE(v_has_module_access, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's accessible modules
CREATE OR REPLACE FUNCTION get_user_accessible_modules(p_user_id uuid)
RETURNS TABLE (
  department_name text,
  department_label text,
  department_icon text,
  department_color text,
  department_order int,
  module_key text,
  module_label text,
  module_icon text,
  module_route text,
  module_order int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.name,
    d.label,
    d.icon,
    d.color,
    d.display_order,
    dm.module_key,
    dm.label,
    dm.icon,
    dm.route,
    dm.display_order
  FROM departments d
  INNER JOIN department_modules dm ON dm.department_id = d.id
  WHERE d.is_enabled = true AND dm.is_enabled = true
  AND (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = p_user_id AND profiles.role = 'admin')
    OR (
      COALESCE((SELECT has_access FROM department_access WHERE user_id = p_user_id AND department_id = d.id), true) = true
      AND COALESCE((SELECT has_access FROM module_access WHERE user_id = p_user_id AND module_id = dm.id), true) = true
    )
  )
  ORDER BY d.display_order, dm.display_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
