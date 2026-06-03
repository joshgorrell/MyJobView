/*
  # Fix Remaining Foreign Key Constraints - Batch 4

  ## Summary
  Fixes more NO ACTION foreign key constraints.

  ## Tables Fixed
  - jobs.messages
  - jobs.payments
  - module_access
  - parts_requests
  - parts_usage_log
  - pending_punchlist_invites
  - project_commission_overrides
  - proposals
*/

-- Fix jobs.messages
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'messages'
  ) THEN
    ALTER TABLE jobs.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
    ALTER TABLE jobs.messages ADD CONSTRAINT messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix jobs.payments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'jobs' AND table_name = 'payments'
  ) THEN
    ALTER TABLE jobs.payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
    ALTER TABLE jobs.payments ADD CONSTRAINT payments_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix module_access
DO $$
BEGIN
  ALTER TABLE module_access DROP CONSTRAINT IF EXISTS module_access_granted_by_fkey;
  ALTER TABLE module_access ADD CONSTRAINT module_access_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix parts_requests
DO $$
BEGIN
  ALTER TABLE parts_requests DROP CONSTRAINT IF EXISTS parts_requests_approved_by_fkey;
  ALTER TABLE parts_requests ADD CONSTRAINT parts_requests_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
    
  ALTER TABLE parts_requests DROP CONSTRAINT IF EXISTS parts_requests_technician_id_fkey;
  ALTER TABLE parts_requests ADD CONSTRAINT parts_requests_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix parts_usage_log
DO $$
BEGIN
  ALTER TABLE parts_usage_log DROP CONSTRAINT IF EXISTS parts_usage_log_technician_id_fkey;
  ALTER TABLE parts_usage_log ALTER COLUMN technician_id DROP NOT NULL;
  ALTER TABLE parts_usage_log ADD CONSTRAINT parts_usage_log_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix pending_punchlist_invites
DO $$
BEGIN
  ALTER TABLE pending_punchlist_invites DROP CONSTRAINT IF EXISTS pending_punchlist_invites_reviewed_by_fkey;
  ALTER TABLE pending_punchlist_invites ADD CONSTRAINT pending_punchlist_invites_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix project_commission_overrides
DO $$
BEGIN
  ALTER TABLE project_commission_overrides DROP CONSTRAINT IF EXISTS project_commission_overrides_created_by_fkey;
  ALTER TABLE project_commission_overrides ADD CONSTRAINT project_commission_overrides_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- Fix proposals
DO $$
BEGIN
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_created_by_fkey;
  ALTER TABLE proposals ADD CONSTRAINT proposals_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
