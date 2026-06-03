/*
  # Restructure Navigation: Create Pipeline and Sales Sections

  1. Changes
    - Create new "Pipeline" parent menu item for lead management features
    - Create new "Sales" parent menu item for sales process features
    - Move Dashboard, Fishbowl, Connections, Leads, Tasks under Pipeline
    - Move Proposals, Projects, Invoices, Products, Inventory, Commissions to Sales
    - Update MyJobView to only contain portal-related items
    - Add menu_section field to support footer placement
    - Reorder all items for better organization

  2. Menu Structure
    - Pipeline (order 15): Dashboard, Fishbowl, Connections, Leads, Tasks
    - Contacts (order 30)
    - Sales (order 55): Proposals, Projects, Invoices, Products, Inventory, Commissions
    - MyJobView (order 80): Dashboard only (portal items)
    - Recur (order 90)
    - Rewards (order 100)
    - Footer: Settings, Preferences, Help, Improvements

  3. Notes
    - Settings, Help, Improvements, Preferences moved to footer section
    - Display order gaps allow for future additions
*/

-- Add menu_section column to support main/footer placement
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS menu_section TEXT DEFAULT 'main' CHECK (menu_section IN ('main', 'footer'));

-- Create Pipeline parent menu item
INSERT INTO menu_items (id, parent_id, label, key, icon, route, display_order, is_enabled, requires_permission, is_system, default_visible, menu_section)
VALUES (
  'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  NULL,
  'Pipeline',
  'pipeline',
  'TrendingUp',
  '/pipeline',
  15,
  true,
  NULL,
  true,
  true,
  'main'
) ON CONFLICT (id) DO NOTHING;

-- Create Sales parent menu item
INSERT INTO menu_items (id, parent_id, label, key, icon, route, display_order, is_enabled, requires_permission, is_system, default_visible, menu_section)
VALUES (
  'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  NULL,
  'Sales',
  'sales',
  'DollarSign',
  '/sales',
  55,
  true,
  NULL,
  true,
  true,
  'main'
) ON CONFLICT (id) DO NOTHING;

-- Move existing items under Pipeline parent
UPDATE menu_items SET 
  parent_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  display_order = 1,
  menu_section = 'main'
WHERE key = 'feed';

UPDATE menu_items SET 
  parent_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  display_order = 2,
  menu_section = 'main'
WHERE key = 'fishbowl';

UPDATE menu_items SET 
  parent_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  display_order = 3,
  menu_section = 'main'
WHERE key = 'connections';

UPDATE menu_items SET 
  parent_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  display_order = 4,
  menu_section = 'main'
WHERE key = 'leads';

UPDATE menu_items SET 
  parent_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  display_order = 5,
  menu_section = 'main'
WHERE key = 'tasks';

-- Move existing items under Sales parent (currently under myjobview)
UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 1,
  menu_section = 'main'
WHERE key = 'proposals';

UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 2,
  menu_section = 'main'
WHERE key = 'projects';

UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 3,
  menu_section = 'main'
WHERE key = 'invoices';

UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 4,
  menu_section = 'main'
WHERE key = 'products';

UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 5,
  menu_section = 'main'
WHERE key = 'inventory';

UPDATE menu_items SET 
  parent_id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
  display_order = 6,
  menu_section = 'main'
WHERE key = 'commissions';

-- Keep MyJobView simple with just dashboard
UPDATE menu_items SET 
  display_order = 80,
  menu_section = 'main'
WHERE key = 'myjobview';

-- Update main nav display orders
UPDATE menu_items SET display_order = 30, menu_section = 'main' WHERE key = 'contacts' AND parent_id IS NULL;
UPDATE menu_items SET display_order = 70, menu_section = 'main' WHERE key = 'mycard' AND parent_id IS NULL;
UPDATE menu_items SET display_order = 90, menu_section = 'main' WHERE key = 'recur' AND parent_id IS NULL;
UPDATE menu_items SET display_order = 100, menu_section = 'main' WHERE key = 'rewards' AND parent_id IS NULL;

-- Move items to footer section
UPDATE menu_items SET 
  display_order = 10,
  menu_section = 'footer'
WHERE key = 'settings' AND parent_id IS NULL;

UPDATE menu_items SET 
  display_order = 20,
  menu_section = 'footer'
WHERE key = 'preferences' AND parent_id IS NULL;

UPDATE menu_items SET 
  display_order = 30,
  menu_section = 'footer'
WHERE key = 'help' AND parent_id IS NULL;

UPDATE menu_items SET 
  display_order = 40,
  menu_section = 'footer'
WHERE key = 'improvements' AND parent_id IS NULL;