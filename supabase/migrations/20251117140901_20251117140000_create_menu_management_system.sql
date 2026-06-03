/*
  # Menu Management System

  1. New Tables
    - `menu_items`
      - `id` (uuid, primary key)
      - `parent_id` (uuid, nullable) - null = main menu item, otherwise sub-item
      - `label` (text) - Display name shown to users
      - `key` (text, unique) - Internal identifier for routing/components
      - `icon` (text) - Lucide React icon name
      - `route` (text) - Component/page identifier
      - `display_order` (int) - Sort order for menu rendering
      - `is_enabled` (boolean) - Global enable/disable
      - `requires_permission` (text, nullable) - Special permission key if needed
      - `is_system` (boolean) - System items cannot be deleted
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `menu_item_roles`
      - `id` (uuid, primary key)
      - `menu_item_id` (uuid, foreign key)
      - `role` (text) - admin, sales, office_manager, field_tech, portal_user
      - `can_access` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - All authenticated users can view menu items based on their role
    - Only admins can modify menu configuration

  3. Indexes
    - Index on parent_id for hierarchy queries
    - Index on display_order for sorting
    - Composite index on (menu_item_id, role) for permission checks

  4. Initial Data
    - Seed with current application menu structure
    - Set appropriate permissions for each role
*/

-- Create menu_items table
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  key text UNIQUE NOT NULL,
  icon text NOT NULL,
  route text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  requires_permission text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create menu_item_roles table
CREATE TABLE IF NOT EXISTS menu_item_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  role text NOT NULL,
  can_access boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(menu_item_id, role)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_id ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON menu_items(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_enabled ON menu_items(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_menu_item_roles_lookup ON menu_item_roles(menu_item_id, role);

-- Enable RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for menu_items

CREATE POLICY "Anyone authenticated can view enabled menu items"
  ON menu_items
  FOR SELECT
  TO authenticated
  USING (is_enabled = true);

CREATE POLICY "Admins can insert menu items"
  ON menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update non-system menu items"
  ON menu_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete non-system menu items"
  ON menu_items
  FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for menu_item_roles

CREATE POLICY "Anyone authenticated can view menu role permissions"
  ON menu_item_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage menu role permissions"
  ON menu_item_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Seed main menu items
INSERT INTO menu_items (label, key, icon, route, display_order, is_system) VALUES
  ('Dashboard', 'feed', 'Activity', 'feed', 10, true),
  ('Fishbowl', 'fishbowl', 'Fish', 'fishbowl', 20, true),
  ('Contacts', 'contacts', 'Users', 'contacts', 30, true),
  ('Connections', 'connections', 'MessageCircle', 'connections', 40, true),
  ('Leads', 'leads', 'Briefcase', 'leads', 50, true),
  ('Tasks', 'tasks', 'CheckSquare', 'tasks', 60, true),
  ('My Card', 'mycard', 'CreditCard', 'mycard', 70, true),
  ('MyJobView', 'myjobview', 'FolderKanban', 'myjobview', 80, true),
  ('Recur', 'recur', 'RefreshCw', 'recur', 90, true),
  ('Rewards', 'rewards', 'Award', 'rewards', 100, true),
  ('Help', 'help', 'BookOpen', 'help', 110, true),
  ('Improvements', 'improvements', 'Lightbulb', 'improvements', 120, true),
  ('Settings', 'settings', 'Settings', 'settings', 130, true),
  ('Preferences', 'preferences', 'User', 'preferences', 140, true)
ON CONFLICT (key) DO NOTHING;

-- Get parent IDs for sub-menus
DO $$
DECLARE
  myjobview_id uuid;
  recur_id uuid;
  settings_id uuid;
BEGIN
  SELECT id INTO myjobview_id FROM menu_items WHERE key = 'myjobview';
  SELECT id INTO recur_id FROM menu_items WHERE key = 'recur';
  SELECT id INTO settings_id FROM menu_items WHERE key = 'settings';

  -- MyJobView sub-pages
  INSERT INTO menu_items (parent_id, label, key, icon, route, display_order, is_system, requires_permission) VALUES
    (myjobview_id, 'Dashboard', 'myjobview_dashboard', 'BarChart3', 'myjobview', 1, true, 'my_job_view_enabled'),
    (myjobview_id, 'Proposals', 'proposals', 'FileText', 'proposals', 2, true, 'my_job_view_enabled'),
    (myjobview_id, 'Projects', 'projects', 'FolderKanban', 'projects', 3, true, 'my_job_view_enabled'),
    (myjobview_id, 'Schedule', 'schedule', 'Calendar', 'schedule', 4, true, 'my_job_view_enabled'),
    (myjobview_id, 'Invoices', 'invoices', 'FileSpreadsheet', 'invoices', 5, true, 'my_job_view_enabled'),
    (myjobview_id, 'Products', 'products', 'Package', 'products', 6, true, 'my_job_view_enabled'),
    (myjobview_id, 'Inventory', 'inventory', 'Warehouse', 'inventory', 7, true, 'my_job_view_enabled'),
    (myjobview_id, 'Commissions', 'commissions', 'DollarSign', 'commissions', 8, true, 'my_job_view_enabled')
  ON CONFLICT (key) DO NOTHING;

  -- Recur sub-pages
  INSERT INTO menu_items (parent_id, label, key, icon, route, display_order, is_system, requires_permission) VALUES
    (recur_id, 'Dashboard', 'recur_dashboard', 'BarChart3', 'recur', 1, true, 'can_access_recur'),
    (recur_id, 'Plans', 'recur_plans', 'Package', 'recur_plans', 2, true, 'can_access_recur'),
    (recur_id, 'Subscriptions', 'recur_subscriptions', 'Users', 'recur_subscriptions', 3, true, 'can_access_recur'),
    (recur_id, 'Invoices', 'recur_invoices', 'FileSpreadsheet', 'recur_invoices', 4, true, 'can_access_recur')
  ON CONFLICT (key) DO NOTHING;

  -- Settings sub-pages
  INSERT INTO menu_items (parent_id, label, key, icon, route, display_order, is_system) VALUES
    (settings_id, 'Users', 'settings_users', 'Users', 'settings_users', 1, true),
    (settings_id, 'Permissions', 'settings_permissions', 'Shield', 'settings_permissions', 2, true),
    (settings_id, 'Company', 'settings_company', 'Building2', 'settings_company', 3, true),
    (settings_id, 'Navigation', 'settings_navigation', 'Menu', 'settings_navigation', 4, true),
    (settings_id, 'Business Cards', 'settings_cards', 'CreditCard', 'settings_cards', 5, true),
    (settings_id, 'QuickBooks', 'settings_quickbooks', 'DollarSign', 'settings_quickbooks', 6, true),
    (settings_id, 'Products', 'settings_products', 'Package', 'settings_products', 7, true),
    (settings_id, 'Rewards', 'settings_rewards', 'Award', 'settings_rewards', 8, true),
    (settings_id, 'Priorities', 'settings_priorities', 'Flag', 'settings_priorities', 9, true),
    (settings_id, 'Email Templates', 'settings_emails', 'Mail', 'settings_emails', 10, true),
    (settings_id, 'Suggestions', 'settings_suggestions', 'Lightbulb', 'settings_suggestions', 11, true)
  ON CONFLICT (key) DO NOTHING;
END $$;

-- Set role permissions for main menu items
INSERT INTO menu_item_roles (menu_item_id, role, can_access)
SELECT id, 'admin', true FROM menu_items WHERE parent_id IS NULL
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_item_roles (menu_item_id, role, can_access)
SELECT id, 'sales', true FROM menu_items WHERE parent_id IS NULL AND key != 'settings'
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_item_roles (menu_item_id, role, can_access)
SELECT id, 'office_manager', true FROM menu_items WHERE parent_id IS NULL
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_item_roles (menu_item_id, role, can_access)
SELECT id, 'field_tech', true FROM menu_items WHERE parent_id IS NULL AND key IN ('feed', 'tasks', 'mycard', 'preferences')
ON CONFLICT (menu_item_id, role) DO NOTHING;

-- Settings sub-pages only for admins
INSERT INTO menu_item_roles (menu_item_id, role, can_access)
SELECT m.id, 'admin', true
FROM menu_items m
INNER JOIN menu_items p ON m.parent_id = p.id
WHERE p.key = 'settings'
ON CONFLICT (menu_item_id, role) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_menu_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS menu_items_updated_at ON menu_items;
CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_menu_items_updated_at();
