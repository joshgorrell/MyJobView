/*
  # Add plan type to recurring plans

  1. Changes
    - Add `plan_type` column to `recurring_plans` table
    - Values: 'security_contract', 'vip_plan', 'other'
    - Defaults to 'other' for existing plans
    - Allows filtering and separating different types of recurring billing
  
  2. Purpose
    - Enable separate tracking of Security Contracts vs VIP Plans
    - Support filtering and analytics by plan type
    - Maintain flexibility for future plan types
*/

-- Add plan_type column to recurring_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_plans' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE recurring_plans 
    ADD COLUMN plan_type text DEFAULT 'other' 
    CHECK (plan_type IN ('security_contract', 'vip_plan', 'other'));
  END IF;
END $$;

-- Update existing VIP plans based on punchlist_enabled flag
UPDATE recurring_plans 
SET plan_type = 'vip_plan' 
WHERE punchlist_enabled = true AND plan_type = 'other';

-- Add index for filtering by plan type
CREATE INDEX IF NOT EXISTS idx_recurring_plans_plan_type ON recurring_plans(plan_type);
