/*
  # Consolidate Portal Access Logic and Rename VIP Plan Type

  ## Overview
  This migration consolidates portal access control by removing redundant columns and renaming
  plan types for clarity. It establishes clear separation between the three portal access methods.

  ## Changes

  1. **Rename plan_type Values**
     - Change 'vip_plan' to 'vip' for clarity and consistency
     - Update CHECK constraint to reflect new value
     - Migrate all existing data

  2. **Remove Redundant Column**
     - Drop punchlist_enabled from recurring_plans table
     - This was redundant with plan_type = 'vip'
     - Source of truth is now solely plan_type

  3. **Update RLS Policies**
     - Replace policies that checked punchlist_enabled
     - Use plan_type = 'vip' instead

  4. **Rename Company Setting**
     - Rename portal_punchlist_enabled to portal_tasks_enabled
     - Better reflects that it controls visibility of tasks tab, not access

  ## Portal Access Methods (for reference)
  
  Three ways customers access the Customer Portal:
  
  1. **VIP Membership** (paid, ongoing)
     - Source: recurring_subscriptions table
     - Filter: plan_type = 'vip' AND status = 'active'
     - Portal access includes tasks/punchlist section
  
  2. **90-Day Test & Tune** (temporary trial)
     - Source: punchlist_access_grants table
     - Filter: access_type = 'test_and_tune' AND expires_at > now()
     - Full portal access during trial period
  
  3. **Promotional Access** (temporary marketing)
     - Source: punchlist_access_grants table
     - Filter: access_type = 'promotional' AND expires_at > now()
     - Full portal access during promotional period

  ## Notes
  - Security contracts do NOT grant portal access
  - Punchlist is just one tab/section within the portal, not a separate access level
  - All three access methods provide the same portal experience
*/

-- Step 1: Drop the old CHECK constraint first (before updating data)
ALTER TABLE recurring_plans
DROP CONSTRAINT IF EXISTS recurring_plans_plan_type_check;

-- Step 2: Update existing plan_type values from 'vip_plan' to 'vip'
UPDATE recurring_plans
SET plan_type = 'vip'
WHERE plan_type = 'vip_plan';

-- Step 3: Add new CHECK constraint with 'vip' instead of 'vip_plan'
ALTER TABLE recurring_plans
ADD CONSTRAINT recurring_plans_plan_type_check 
CHECK (plan_type IN ('vip', 'security_monitoring'));

-- Step 4: Drop policies that depend on punchlist_enabled column
DROP POLICY IF EXISTS "Portal users can view active VIP plans" ON recurring_plans;
DROP POLICY IF EXISTS "Anonymous users can view active VIP plans" ON recurring_plans;

-- Step 5: Remove redundant punchlist_enabled column
ALTER TABLE recurring_plans
DROP COLUMN IF EXISTS punchlist_enabled;

-- Step 6: Recreate policies using plan_type = 'vip' instead
CREATE POLICY "Portal users can view active VIP plans"
  ON recurring_plans
  FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    AND plan_type = 'vip'
  );

CREATE POLICY "Anonymous users can view active VIP plans"
  ON recurring_plans
  FOR SELECT
  TO anon
  USING (
    is_active = true 
    AND plan_type = 'vip'
  );

-- Step 7: Update company_settings to rename portal_punchlist_enabled to portal_tasks_enabled
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' 
    AND column_name = 'portal_punchlist_enabled'
  ) THEN
    -- Add new column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'company_settings' 
      AND column_name = 'portal_tasks_enabled'
    ) THEN
      ALTER TABLE company_settings
      ADD COLUMN portal_tasks_enabled boolean DEFAULT true;
    END IF;
    
    -- Copy values from old to new
    UPDATE company_settings
    SET portal_tasks_enabled = portal_punchlist_enabled;
    
    -- Drop old column
    ALTER TABLE company_settings
    DROP COLUMN portal_punchlist_enabled;
  END IF;
END $$;

-- Step 8: Add helpful comments to recurring_plans table
COMMENT ON TABLE recurring_plans IS 'Defines available recurring billing plans. VIP plans grant customer portal access via active subscriptions. Security monitoring plans do not grant portal access.';

COMMENT ON COLUMN recurring_plans.plan_type IS 'Type of plan: vip (grants portal access) or security_monitoring (billing only, no portal access)';

-- Step 9: Add helpful comments to punchlist_access_grants table
COMMENT ON TABLE punchlist_access_grants IS 'Grants temporary customer portal access. Used for test_and_tune (90-day trials) and promotional (marketing) access. Different from VIP subscriptions which are ongoing and paid.';

COMMENT ON COLUMN punchlist_access_grants.access_type IS 'Type of temporary portal access: test_and_tune (90-day trial), promotional (marketing trial), or direct (manual grant)';
