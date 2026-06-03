/*
  # Add Granular Menu Permissions System

  ## Overview
  This migration enhances the menu system to support:
  1. Per-role menu item visibility (which roles can see which menu items)
  2. Per-user menu overrides (individual users can have custom menus)
  3. Role-based menu templates for easy configuration

  ## Changes

  ### New Tables
  - `menu_role_permissions` - Maps menu items to roles with visibility settings
  - `user_menu_overrides` - Per-user custom menu configurations

  ### Modified Tables
  - `menu_items` - Add `default_visible` flag

  ## Security
  - Enable RLS on all new tables
  - Only admins can manage menu permissions
  - Users can view their own menu configuration
*/

-- Create menu_role_permissions table
CREATE TABLE IF NOT EXISTS menu_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'sales', 'office_manager', 'field_tech', 'portal_user')),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(menu_item_id, role)
);

-- Create user_menu_overrides table
CREATE TABLE IF NOT EXISTS user_menu_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  visible boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, menu_item_id)
);

-- Add default_visible column to menu_items (true = visible to all by default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'default_visible'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN default_visible boolean DEFAULT true;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE menu_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_menu_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for menu_role_permissions

-- Admins can manage all role permissions
CREATE POLICY "Admins can manage role permissions"
  ON menu_role_permissions
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

-- All authenticated users can view role permissions (needed for menu rendering)
CREATE POLICY "Users can view role permissions"
  ON menu_role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_menu_overrides

-- Admins can manage all user overrides
CREATE POLICY "Admins can manage user overrides"
  ON user_menu_overrides
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

-- Users can view their own menu overrides
CREATE POLICY "Users can view own menu overrides"
  ON user_menu_overrides
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_menu_item ON menu_role_permissions(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_role ON menu_role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_user_menu_overrides_user ON user_menu_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_menu_overrides_menu_item ON user_menu_overrides(menu_item_id);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_menu_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_menu_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_menu_role_permissions_updated_at ON menu_role_permissions;
CREATE TRIGGER update_menu_role_permissions_updated_at
  BEFORE UPDATE ON menu_role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_menu_role_permissions_updated_at();

DROP TRIGGER IF EXISTS update_user_menu_overrides_updated_at ON user_menu_overrides;
CREATE TRIGGER update_user_menu_overrides_updated_at
  BEFORE UPDATE ON user_menu_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_user_menu_overrides_updated_at();

-- Seed default permissions for all existing menu items (all roles can see all items by default)
INSERT INTO menu_role_permissions (menu_item_id, role, visible)
SELECT id, 'admin', true FROM menu_items
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_role_permissions (menu_item_id, role, visible)
SELECT id, 'sales', true FROM menu_items
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_role_permissions (menu_item_id, role, visible)
SELECT id, 'office_manager', true FROM menu_items
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_role_permissions (menu_item_id, role, visible)
SELECT id, 'field_tech', true FROM menu_items
ON CONFLICT (menu_item_id, role) DO NOTHING;

INSERT INTO menu_role_permissions (menu_item_id, role, visible)
SELECT id, 'portal_user', true FROM menu_items
ON CONFLICT (menu_item_id, role) DO NOTHING;
