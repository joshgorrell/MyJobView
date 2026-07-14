/*
# Register Maintenance Agreements and Equipment Warranty Modules

## Summary
Registers two new modules in the Finance department for managing maintenance
agreements and equipment extended warranty agreements. Grants access to admin,
finance, and manager roles.

## New Department Modules
1. maintenance_agreements — "Maintenance Agreements" (icon: Wrench, sort_order: 63)
2. equipment_warranty — "Equipment Warranty" (icon: ShieldCheck, sort_order: 64)

## Role Module Access
Grants has_access=true to admin, finance, and manager roles for both new modules.

## Security
No RLS changes needed — existing table-level policies cover new rows.
*/

-- Insert maintenance_agreements module
INSERT INTO department_modules (
  department_id, module_key, display_name, description, icon, sort_order, is_active, organization_id
)
SELECT
  'b7631430-64a0-4e58-b369-32b66eac932c',
  'maintenance_agreements',
  'Maintenance Agreements',
  'Manage system maintenance agreements with recurring billing.',
  'Wrench',
  63,
  true,
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM department_modules WHERE module_key = 'maintenance_agreements' AND department_id = 'b7631430-64a0-4e58-b369-32b66eac932c'
);

-- Insert equipment_warranty module
INSERT INTO department_modules (
  department_id, module_key, display_name, description, icon, sort_order, is_active, organization_id
)
SELECT
  'b7631430-64a0-4e58-b369-32b66eac932c',
  'equipment_warranty',
  'Equipment Warranty',
  'Manage equipment extended warranty agreements with recurring billing.',
  'ShieldCheck',
  64,
  true,
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM department_modules WHERE module_key = 'equipment_warranty' AND department_id = 'b7631430-64a0-4e58-b369-32b66eac932c'
);

-- Grant role_module_access for admin, finance, and manager
INSERT INTO role_module_access (role_id, module_id, has_access, organization_id)
SELECT r.id, dm.id, true, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
FROM roles r
CROSS JOIN department_modules dm
WHERE dm.module_key IN ('maintenance_agreements', 'equipment_warranty')
  AND dm.department_id = 'b7631430-64a0-4e58-b369-32b66eac932c'
  AND r.role_key IN ('admin', 'finance', 'manager')
  AND NOT EXISTS (
    SELECT 1 FROM role_module_access rma
    WHERE rma.role_id = r.id AND rma.module_id = dm.id
  );
