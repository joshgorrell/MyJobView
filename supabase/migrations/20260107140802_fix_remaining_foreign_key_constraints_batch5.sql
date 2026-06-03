/*
  # Fix Remaining Foreign Key Constraints - Batch 5

  ## Summary
  Continues fixing NO ACTION foreign key constraints.

  ## Tables Fixed
  - pto_accrual_history
  - pto_requests
  - punchlist_task_photos
  - purchase_orders
  - recurring_plans
  - review_requests
  - security_contract_cancellations
  - service_additional_charges
  - service_billing_queue
*/

-- Fix pto_accrual_history
DO $$
BEGIN
  ALTER TABLE pto_accrual_history DROP CONSTRAINT IF EXISTS pto_accrual_history_created_by_fkey;
  ALTER TABLE pto_accrual_history ADD CONSTRAINT pto_accrual_history_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix pto_requests
DO $$
BEGIN
  ALTER TABLE pto_requests DROP CONSTRAINT IF EXISTS pto_requests_reviewed_by_fkey;
  ALTER TABLE pto_requests ADD CONSTRAINT pto_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix punchlist_task_photos
DO $$
BEGIN
  ALTER TABLE punchlist_task_photos DROP CONSTRAINT IF EXISTS punchlist_task_photos_uploaded_by_fkey;
  ALTER TABLE punchlist_task_photos ALTER COLUMN uploaded_by DROP NOT NULL;
  ALTER TABLE punchlist_task_photos ADD CONSTRAINT punchlist_task_photos_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix purchase_orders
DO $$
BEGIN
  ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey;
  ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix recurring_plans
DO $$
BEGIN
  ALTER TABLE recurring_plans DROP CONSTRAINT IF EXISTS recurring_plans_created_by_fkey;
  ALTER TABLE recurring_plans ADD CONSTRAINT recurring_plans_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix review_requests
DO $$
BEGIN
  ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_sent_by_fkey;
  ALTER TABLE review_requests ADD CONSTRAINT review_requests_sent_by_fkey
    FOREIGN KEY (sent_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix security_contract_cancellations
DO $$
BEGIN
  ALTER TABLE security_contract_cancellations DROP CONSTRAINT IF EXISTS security_contract_cancellations_processed_by_fkey;
  ALTER TABLE security_contract_cancellations ADD CONSTRAINT security_contract_cancellations_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix service_additional_charges
DO $$
BEGIN
  ALTER TABLE service_additional_charges DROP CONSTRAINT IF EXISTS service_additional_charges_added_by_fkey;
  ALTER TABLE service_additional_charges ADD CONSTRAINT service_additional_charges_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix service_billing_queue
DO $$
BEGIN
  ALTER TABLE service_billing_queue DROP CONSTRAINT IF EXISTS service_billing_queue_assigned_to_user_id_fkey;
  ALTER TABLE service_billing_queue ADD CONSTRAINT service_billing_queue_assigned_to_user_id_fkey
    FOREIGN KEY (assigned_to_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
