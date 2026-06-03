/*
  # Fix recurring plan_type values for consistency

  ## Problem
  The VIPPlanManagement component was saving plans with plan_type = 'vip',
  but the Recurring Billing page (RecurView, RecurringDashboard, RecurringPlans)
  looks for plan_type = 'vip_plan'. This mismatch caused VIP plans to never
  appear in the Recurring Billing tabs or dashboard stats.

  ## Changes
  1. Update all existing recurring_plans with plan_type = 'vip' to use 'vip_plan'
  2. Update the plan_type check constraint to allow 'vip_plan' instead of 'vip'

  ## Impact
  - VIP plans will now correctly appear in the Recurring Billing > VIP Plans tab
  - The dashboard Security Contracts and VIP Plans stats will now be accurate
  - No data is deleted; only the plan_type string value is corrected
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'recurring_plans'
    AND constraint_name = 'recurring_plans_plan_type_check'
  ) THEN
    ALTER TABLE recurring_plans DROP CONSTRAINT recurring_plans_plan_type_check;
  END IF;
END $$;

UPDATE recurring_plans
SET plan_type = 'vip_plan'
WHERE plan_type = 'vip';

ALTER TABLE recurring_plans
  ADD CONSTRAINT recurring_plans_plan_type_check
  CHECK (plan_type IN ('security_contract', 'vip_plan', 'other'));
