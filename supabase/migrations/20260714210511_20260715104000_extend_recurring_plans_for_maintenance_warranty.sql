/*
# Extend Recurring Plans for Maintenance and Warranty Agreements

## Summary
Extends the recurring_plans.plan_type CHECK constraint to include 'maintenance_agreement'
and 'equipment_warranty' alongside existing values. Creates two new default recurring
plans for maintenance and warranty billing.

## Changes

### Constraint Update
- recurring_plans_plan_type_check: now accepts 'security_contract', 'vip_plan', 'other',
  'maintenance_agreement', 'equipment_warranty'

### New Default Plans
1. "Maintenance Agreement (Annual)" — plan_type='maintenance_agreement', billing_frequency='yearly', amount=0
2. "Equipment Extended Warranty (Annual)" — plan_type='equipment_warranty', billing_frequency='yearly', amount=0

Both plans have amount=0 because the actual billing amount comes from the
subscription's custom_amount field.

## Security
No RLS changes needed — existing table-level policies cover new rows.
*/

-- Drop and recreate the plan_type CHECK constraint with new values
ALTER TABLE recurring_plans DROP CONSTRAINT IF EXISTS recurring_plans_plan_type_check;
ALTER TABLE recurring_plans ADD CONSTRAINT recurring_plans_plan_type_check
  CHECK (plan_type IN ('security_contract', 'vip_plan', 'other', 'maintenance_agreement', 'equipment_warranty'));

-- Insert default Maintenance Agreement plan (if not exists)
INSERT INTO recurring_plans (
  company_id, plan_name, description, billing_frequency, amount, is_active, plan_type, organization_id
)
SELECT
  '8affa764-8533-47ab-9fac-e8c6f2a5e86d',
  'Maintenance Agreement (Annual)',
  'Default recurring plan for system maintenance agreements. Billed annually.',
  'yearly',
  0,
  true,
  'maintenance_agreement',
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_plans WHERE plan_type = 'maintenance_agreement' AND organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
);

-- Insert default Equipment Warranty plan (if not exists)
INSERT INTO recurring_plans (
  company_id, plan_name, description, billing_frequency, amount, is_active, plan_type, organization_id
)
SELECT
  '8affa764-8533-47ab-9fac-e8c6f2a5e86d',
  'Equipment Extended Warranty (Annual)',
  'Default recurring plan for equipment extended warranty coverage. Billed annually.',
  'yearly',
  0,
  true,
  'equipment_warranty',
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_plans WHERE plan_type = 'equipment_warranty' AND organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
);
