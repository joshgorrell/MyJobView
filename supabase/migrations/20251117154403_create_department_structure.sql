/*
  # Create Department Structure System

  ## Overview
  Implements the 5-department organizational structure for Electronic Life:
  - Pipeline (Sales & Lead Management)
  - Production (Project Execution)
  - Dispatch (Field Operations & Scheduling)
  - Finance (Billing, Payroll, Accounting)
  - Admin (System Configuration)

  ## New Tables

  ### departments
  Core department definitions with metadata
  - `id` (uuid, primary key)
  - `name` (text, unique) - Department name (pipeline, production, dispatch, finance, admin)
  - `display_name` (text) - Human-readable name
  - `description` (text) - Department purpose
  - `icon` (text) - Lucide icon name
  - `color` (text) - Theme color for UI
  - `sort_order` (integer) - Display order
  - `is_active` (boolean) - Whether department is enabled

  ### department_modules
  Modules/features within each department
  - `id` (uuid, primary key)
  - `department_id` (uuid, foreign key)
  - `module_key` (text) - Unique identifier for routing
  - `display_name` (text) - Human-readable name
  - `description` (text) - Module purpose
  - `icon` (text) - Lucide icon name
  - `sort_order` (integer) - Display order within department
  - `is_active` (boolean) - Whether module is enabled
  - `parent_module_id` (uuid, nullable) - For nested submodules

  ### department_role_access
  Which roles can access which departments
  - `id` (uuid, primary key)
  - `department_id` (uuid, foreign key)
  - `role` (text) - Role name
  - `has_access` (boolean) - Access granted
  - `can_manage` (boolean) - Can manage department settings

  ### department_user_overrides
  Per-user department access overrides
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `department_id` (uuid, foreign key)
  - `has_access` (boolean) - Override access

  ### module_role_access
  Which roles can access which modules within departments
  - `id` (uuid, primary key)
  - `module_id` (uuid, foreign key)
  - `role` (text) - Role name
  - `has_access` (boolean) - Access granted

  ### module_user_overrides
  Per-user module access overrides
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `module_id` (uuid, foreign key)
  - `has_access` (boolean) - Override access

  ## Security
  - Enable RLS on all tables
  - All users can view their accessible departments/modules
  - Only admins can modify department structure
  - Only admins can modify access controls
*/

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL CHECK (name IN ('pipeline', 'production', 'dispatch', 'finance', 'admin')),
  display_name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create department_modules table
CREATE TABLE IF NOT EXISTS department_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  icon text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean DEFAULT true,
  parent_module_id uuid REFERENCES department_modules(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(department_id, module_key)
);

-- Create department_role_access table
CREATE TABLE IF NOT EXISTS department_role_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'sales', 'bd', 'project_manager', 'technician', 'office_manager', 'field_tech', 'portal_user')),
  has_access boolean DEFAULT true,
  can_manage boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(department_id, role)
);

-- Create department_user_overrides table
CREATE TABLE IF NOT EXISTS department_user_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  has_access boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, department_id)
);

-- Create module_role_access table
CREATE TABLE IF NOT EXISTS module_role_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'sales', 'bd', 'project_manager', 'technician', 'office_manager', 'field_tech', 'portal_user')),
  has_access boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(module_id, role)
);

-- Create module_user_overrides table
CREATE TABLE IF NOT EXISTS module_user_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  has_access boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_department_modules_department ON department_modules(department_id);
CREATE INDEX IF NOT EXISTS idx_department_modules_parent ON department_modules(parent_module_id);
CREATE INDEX IF NOT EXISTS idx_department_role_access_dept ON department_role_access(department_id);
CREATE INDEX IF NOT EXISTS idx_department_role_access_role ON department_role_access(role);
CREATE INDEX IF NOT EXISTS idx_department_user_overrides_user ON department_user_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_module_role_access_module ON module_role_access(module_id);
CREATE INDEX IF NOT EXISTS idx_module_role_access_role ON module_role_access(role);
CREATE INDEX IF NOT EXISTS idx_module_user_overrides_user ON module_user_overrides(user_id);

-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_role_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_user_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_role_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_user_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for departments (all authenticated users can view)
CREATE POLICY "Anyone can view departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage departments"
  ON departments FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- RLS Policies for department_modules
CREATE POLICY "Anyone can view modules"
  ON department_modules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage modules"
  ON department_modules FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- RLS Policies for department_role_access
CREATE POLICY "Anyone can view department role access"
  ON department_role_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage department role access"
  ON department_role_access FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- RLS Policies for department_user_overrides
CREATE POLICY "Users can view own department overrides"
  ON department_user_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can manage department user overrides"
  ON department_user_overrides FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- RLS Policies for module_role_access
CREATE POLICY "Anyone can view module role access"
  ON module_role_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage module role access"
  ON module_role_access FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- RLS Policies for module_user_overrides
CREATE POLICY "Users can view own module overrides"
  ON module_user_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can manage module user overrides"
  ON module_user_overrides FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
