/*
  # Create Sales Department and Reorganize Module Structure

  ## Overview
  Separates sales deal-closing activities from lead generation activities by creating
  a new "Sales" department and reorganizing modules across departments.

  ## Changes

  ### New Department
  - **Sales** - Deal-closing activities (proposals, orders, performance)
    - Position between Pipeline (#2) and Production (#3)
    - Color: emerald green
    - Icon: TrendingUp

  ### Module Moves
  
  **From Pipeline to Sales:**
  1. sales_dashboard → Sales Dashboard
  2. proposals → Proposals  
  3. sales_orders → Sales Orders
  4. sales_activity → Activity Log
  5. sales_performance → Performance

  **From Pipeline to Finance:**
  1. recur → Recurring Revenue

  **Add to Pipeline:**
  1. connections → Connections (relationship tracking)

  **Remaining in Pipeline:**
  1. pipeline_board → Pipeline Board
  2. leads → Leads
  3. fishbowl → Fishbowl
  4. contacts → Contacts

  ### Updated Sort Orders
  1. Pipeline (was 1, stays 1)
  2. Sales (new, 2)
  3. Production (was 2, now 3)
  4. Dispatch (was 3, now 4)
  5. Finance (was 4, now 5)
  6. Admin (was 5, now 6)

  ## Security
  - Set up role access for Sales department (sales, bd, admin, office_manager)
  - All module moves preserve existing data and relationships
*/

-- Step 1: Update existing department sort orders to make room
UPDATE departments SET sort_order = 6 WHERE name = 'admin';
UPDATE departments SET sort_order = 5 WHERE name = 'finance';
UPDATE departments SET sort_order = 4 WHERE name = 'dispatch';
UPDATE departments SET sort_order = 3 WHERE name = 'production';

-- Step 2: Create Sales department
INSERT INTO departments (name, display_name, description, icon, color, sort_order, is_active)
VALUES (
  'sales',
  'Sales',
  'Close deals and manage customer relationships from proposal to signed order',
  'TrendingUp',
  'emerald',
  2,
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

-- Step 3: Get department IDs and reorganize modules
DO $$
DECLARE
  pipeline_id uuid;
  sales_id uuid;
  finance_id uuid;
BEGIN
  SELECT id INTO pipeline_id FROM departments WHERE name = 'pipeline';
  SELECT id INTO sales_id FROM departments WHERE name = 'sales';
  SELECT id INTO finance_id FROM departments WHERE name = 'finance';

  -- Step 4: Move modules from Pipeline to Sales
  UPDATE department_modules 
  SET department_id = sales_id, sort_order = 1
  WHERE module_key = 'sales_dashboard';

  UPDATE department_modules 
  SET department_id = sales_id, sort_order = 2
  WHERE module_key = 'proposals';

  UPDATE department_modules 
  SET department_id = sales_id, sort_order = 3
  WHERE module_key = 'sales_orders';

  UPDATE department_modules 
  SET department_id = sales_id, sort_order = 4
  WHERE module_key = 'sales_activity';

  UPDATE department_modules 
  SET department_id = sales_id, sort_order = 5
  WHERE module_key = 'sales_performance';

  -- Step 5: Move Recurring Revenue to Finance
  UPDATE department_modules 
  SET department_id = finance_id, sort_order = 10
  WHERE module_key = 'recur';

  -- Step 6: Add Connections module to Pipeline
  INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active)
  VALUES (
    pipeline_id,
    'connections',
    'Connections',
    'Relationship tracking and follow-up management',
    'Network',
    5,
    true
  )
  ON CONFLICT (department_id, module_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

  -- Step 7: Update Pipeline module sort orders
  UPDATE department_modules SET sort_order = 1 WHERE module_key = 'pipeline_board' AND department_id = pipeline_id;
  UPDATE department_modules SET sort_order = 2 WHERE module_key = 'leads' AND department_id = pipeline_id;
  UPDATE department_modules SET sort_order = 3 WHERE module_key = 'fishbowl' AND department_id = pipeline_id;
  UPDATE department_modules SET sort_order = 4 WHERE module_key = 'contacts' AND department_id = pipeline_id;
  UPDATE department_modules SET sort_order = 5 WHERE module_key = 'connections' AND department_id = pipeline_id;

END $$;

-- Step 8: Set up role access for Sales department
INSERT INTO department_role_access (department_id, role, has_access, can_manage)
SELECT d.id, r.role, true, (r.role = 'admin')
FROM departments d
CROSS JOIN (
  SELECT 'admin' as role UNION ALL
  SELECT 'sales' UNION ALL
  SELECT 'bd' UNION ALL
  SELECT 'office_manager'
) r
WHERE d.name = 'sales'
ON CONFLICT (department_id, role) DO UPDATE SET
  has_access = EXCLUDED.has_access,
  can_manage = EXCLUDED.can_manage;

-- Step 9: Grant module access for Sales department modules
DO $$
DECLARE
  sales_module record;
BEGIN
  FOR sales_module IN 
    SELECT id FROM department_modules 
    WHERE department_id = (SELECT id FROM departments WHERE name = 'sales')
  LOOP
    INSERT INTO module_role_access (module_id, role, has_access)
    SELECT sales_module.id, r.role, true
    FROM (
      SELECT 'admin' as role UNION ALL
      SELECT 'sales' UNION ALL
      SELECT 'bd' UNION ALL
      SELECT 'office_manager'
    ) r
    ON CONFLICT (module_id, role) DO UPDATE SET has_access = EXCLUDED.has_access;
  END LOOP;
END $$;
