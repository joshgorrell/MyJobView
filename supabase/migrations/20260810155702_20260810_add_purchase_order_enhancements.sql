/*
# Purchase Order System Enhancements

## Summary
Adds submitted status tracking, receiving quantities, and permission controls to the purchase order system.

## Changes

### 1. purchase_orders table
- Add `submitted_at` (timestamptz, nullable) — records when a draft was submitted/emailed
- Add `submitted_by` (uuid, nullable) — records who submitted the PO

### 2. po_items table
- Add `quantity_received` (integer, default 0) — tracks how many units have been received
- Add `received_at` (timestamptz, nullable) — records when the item was last received

### 3. profiles table
- Add `can_create_purchase_orders` (boolean, default false) — controls who can create POs
- Set to true for admin, manager, and finance roles by default

### 4. Navigation
- Add 'purchase_orders' module to the production department
- Grant access to admin, manager, finance roles

### 5. RLS Policies
- Add policies for purchase_orders and po_items (authenticated users can CRUD)
*/

-- 1. Add submitted_at and submitted_by to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_by uuid;

-- 2. Add quantity_received and received_at to po_items
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS quantity_received integer NOT NULL DEFAULT 0;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- 3. Add can_create_purchase_orders to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_create_purchase_orders boolean NOT NULL DEFAULT false;

-- Set default to true for admin, manager, and finance roles
UPDATE profiles SET can_create_purchase_orders = true WHERE role IN ('admin', 'manager', 'finance');

-- 4. Add purchase_orders module to production department
DO $$
DECLARE
    prod_dept_id uuid;
    org_id uuid;
    admin_role_id uuid;
    manager_role_id uuid;
    finance_role_id uuid;
    po_module_id uuid;
BEGIN
    SELECT id, organization_id INTO prod_dept_id, org_id FROM departments WHERE name = 'production' LIMIT 1;
    IF prod_dept_id IS NULL THEN
        RAISE NOTICE 'Production department not found, skipping module insert';
        RETURN;
    END IF;

    -- Insert module if it doesn't exist
    INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active, organization_id)
    VALUES (prod_dept_id, 'purchase_orders', 'Purchase Orders', 'Manage purchase orders and receiving', 'ShoppingCart', 65, true, org_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO po_module_id;

    -- If module already existed, get its ID
    IF po_module_id IS NULL THEN
        SELECT id INTO po_module_id FROM department_modules WHERE module_key = 'purchase_orders' LIMIT 1;
    END IF;

    -- Get role IDs from roles table
    SELECT id INTO admin_role_id FROM roles WHERE role_key = 'admin' LIMIT 1;
    SELECT id INTO manager_role_id FROM roles WHERE role_key = 'manager' LIMIT 1;
    SELECT id INTO finance_role_id FROM roles WHERE role_key = 'finance' LIMIT 1;

    -- Grant access to admin, manager, finance
    IF admin_role_id IS NOT NULL AND po_module_id IS NOT NULL THEN
        INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
        VALUES (admin_role_id, po_module_id, true, org_id)
        ON CONFLICT DO NOTHING;
    END IF;
    IF manager_role_id IS NOT NULL AND po_module_id IS NOT NULL THEN
        INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
        VALUES (manager_role_id, po_module_id, true, org_id)
        ON CONFLICT DO NOTHING;
    END IF;
    IF finance_role_id IS NOT NULL AND po_module_id IS NOT NULL THEN
        INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
        VALUES (finance_role_id, po_module_id, true, org_id)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5. RLS policies for purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_select_authenticated" ON purchase_orders;
CREATE POLICY "po_select_authenticated"
ON purchase_orders FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "po_insert_authenticated" ON purchase_orders;
CREATE POLICY "po_insert_authenticated"
ON purchase_orders FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "po_update_authenticated" ON purchase_orders;
CREATE POLICY "po_update_authenticated"
ON purchase_orders FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "po_delete_authenticated" ON purchase_orders;
CREATE POLICY "po_delete_authenticated"
ON purchase_orders FOR DELETE
TO authenticated
USING (true);

-- RLS policies for po_items
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_items_select_authenticated" ON po_items;
CREATE POLICY "po_items_select_authenticated"
ON po_items FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "po_items_insert_authenticated" ON po_items;
CREATE POLICY "po_items_insert_authenticated"
ON po_items FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "po_items_update_authenticated" ON po_items;
CREATE POLICY "po_items_update_authenticated"
ON po_items FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "po_items_delete_authenticated" ON po_items;
CREATE POLICY "po_items_delete_authenticated"
ON po_items FOR DELETE
TO authenticated
USING (true);

-- 6. Add index for performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON po_items(po_id);
