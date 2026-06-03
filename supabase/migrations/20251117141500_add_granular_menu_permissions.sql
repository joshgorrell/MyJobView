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
  - `menu_items` - Remove old role columns, add `default_visible` flag

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

-- Migrate existing role permissions to new table
-- For each menu item, check old role columns and create entries
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT id, visible_to_admin, visible_to_sales, visible_to_office_manager, visible_to_field_tech, visible_to_portal_user FROM menu_items
  LOOP
    -- Admin
    IF item.visible_to_admin IS NOT NULL THEN
      INSERT INTO menu_role_permissions (menu_item_id, role, visible)
      VALUES (item.id, 'admin', item.visible_to_admin)
      ON CONFLICT (menu_item_id, role) DO NOTHING;
    END IF;

    -- Sales
    IF item.visible_to_sales IS NOT NULL THEN
      INSERT INTO menu_role_permissions (menu_item_id, role, visible)
      VALUES (item.id, 'sales', item.visible_to_sales)
      ON CONFLICT (menu_item_id, role) DO NOTHING;
    END IF;

    -- Office Manager
    IF item.visible_to_office_manager IS NOT NULL THEN
      INSERT INTO menu_role_permissions (menu_item_id, role, visible)
      VALUES (item.id, 'office_manager', item.visible_to_office_manager)
      ON CONFLICT (menu_item_id, role) DO NOTHING;
    END IF;

    -- Field Tech
    IF item.visible_to_field_tech IS NOT NULL THEN
      INSERT INTO menu_role_permissions (menu_item_id, role, visible)
      VALUES (item.id, 'field_tech', item.visible_to_field_tech)
      ON CONFLICT (menu_item_id, role) DO NOTHING;
    END IF;

    -- Portal User
    IF item.visible_to_portal_user IS NOT NULL THEN
      INSERT INTO menu_role_permissions (menu_item_id, role, visible)
      VALUES (item.id, 'portal_user', item.visible_to_portal_user)
      ON CONFLICT (menu_item_id, role) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Drop old role permission columns
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible_to_admin;
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible_to_sales;
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible_to_office_manager;
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible_to_field_tech;
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible_to_portal_user;

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
