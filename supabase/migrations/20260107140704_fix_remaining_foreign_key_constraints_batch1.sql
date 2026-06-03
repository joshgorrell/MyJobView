/*
  # Fix Remaining Foreign Key Constraints - Batch 1

  ## Summary
  Fixes NO ACTION foreign key constraints that block user deletion.
  Changes them to SET NULL to preserve work records.

  ## Tables Fixed
  - clock_in_rewards_log
  - clock_out_rewards_log
  - commission_adjustments
  - commission_payments
  - daily_clock_entries
  - department_access
  - discussion_post_bumps
*/

-- Fix clock_in_rewards_log
DO $$
BEGIN
  ALTER TABLE clock_in_rewards_log DROP CONSTRAINT IF EXISTS clock_in_rewards_log_technician_id_fkey;
  ALTER TABLE clock_in_rewards_log ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE clock_in_rewards_log ADD CONSTRAINT clock_in_rewards_log_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix clock_out_rewards_log
DO $$
BEGIN
  ALTER TABLE clock_out_rewards_log DROP CONSTRAINT IF EXISTS clock_out_rewards_log_technician_id_fkey;
  ALTER TABLE clock_out_rewards_log ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE clock_out_rewards_log ADD CONSTRAINT clock_out_rewards_log_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix commission_adjustments
DO $$
BEGIN
  ALTER TABLE commission_adjustments DROP CONSTRAINT IF EXISTS commission_adjustments_adjusted_by_fkey;
  ALTER TABLE commission_adjustments ADD CONSTRAINT commission_adjustments_adjusted_by_fkey
    FOREIGN KEY (adjusted_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix commission_payments
DO $$
BEGIN
  ALTER TABLE commission_payments DROP CONSTRAINT IF EXISTS commission_payments_processed_by_fkey;
  ALTER TABLE commission_payments ADD CONSTRAINT commission_payments_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE commission_payments DROP CONSTRAINT IF EXISTS commission_payments_employee_id_fkey;
  ALTER TABLE commission_payments ALTER COLUMN employee_id DROP NOT NULL;
  ALTER TABLE commission_payments ADD CONSTRAINT commission_payments_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix daily_clock_entries
DO $$
BEGIN
  ALTER TABLE daily_clock_entries DROP CONSTRAINT IF EXISTS daily_clock_entries_technician_id_fkey;
  ALTER TABLE daily_clock_entries ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE daily_clock_entries ADD CONSTRAINT daily_clock_entries_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE daily_clock_entries DROP CONSTRAINT IF EXISTS daily_clock_entries_adjusted_by_fkey;
  ALTER TABLE daily_clock_entries ADD CONSTRAINT daily_clock_entries_adjusted_by_fkey
    FOREIGN KEY (adjusted_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE daily_clock_entries DROP CONSTRAINT IF EXISTS daily_clock_entries_admin_reviewed_by_fkey;
  ALTER TABLE daily_clock_entries ADD CONSTRAINT daily_clock_entries_admin_reviewed_by_fkey
    FOREIGN KEY (admin_reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix department_access
DO $$
BEGIN
  ALTER TABLE department_access DROP CONSTRAINT IF EXISTS department_access_granted_by_fkey;
  ALTER TABLE department_access ADD CONSTRAINT department_access_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix discussion_post_bumps
DO $$
BEGIN
  ALTER TABLE discussion_post_bumps DROP CONSTRAINT IF EXISTS discussion_post_bumps_bumped_by_fkey;
  ALTER TABLE discussion_post_bumps ALTER COLUMN bumped_by DROP NOT NULL;
  ALTER TABLE discussion_post_bumps ADD CONSTRAINT discussion_post_bumps_bumped_by_fkey
    FOREIGN KEY (bumped_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
