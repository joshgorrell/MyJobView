/*
  # Add Service Request Kickback System

  ## Overview
  Allows service managers to kick back service requests to the originating sales person
  when the request lacks sufficient information. Adds a full closed-loop feedback workflow.

  ## Changes

  ### Modified Tables
  - `service_requests`
    - New status value: `needs_more_info` added to status constraint
    - New column: `kickback_reason` (text) - manager's explanation of what is missing
    - New column: `kicked_back_by` (uuid) - reference to the service manager who kicked it back
    - New column: `kicked_back_at` (timestamptz) - when the kickback occurred

  ### Modified Constraints
  - `notifications` table: adds `service_request_kicked_back` and `service_request_resubmitted` types
    while preserving all existing notification types including `system`

  ### New Functions & Triggers
  - `notify_creator_service_request_kicked_back()` - notifies the original creator when kicked back
  - `notify_managers_service_request_resubmitted()` - notifies service managers when resubmitted

  ## Security
  - No new tables; existing RLS policies on service_requests and notifications cover these changes
*/

-- -------------------------
-- 1. Add kickback columns to service_requests
-- -------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_requests' AND column_name = 'kickback_reason'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN kickback_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_requests' AND column_name = 'kicked_back_by'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN kicked_back_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_requests' AND column_name = 'kicked_back_at'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN kicked_back_at timestamptz;
  END IF;
END $$;

-- -------------------------
-- 2. Update status constraint to include needs_more_info
-- -------------------------
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('open', 'scheduled', 'in_progress', 'closed', 'cancelled', 'needs_more_info'));

-- -------------------------
-- 3. Add new notification types (preserve all existing types including 'system')
-- -------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'lead'::text,
    'task'::text,
    'appointment'::text,
    'proposal'::text,
    'invoice'::text,
    'message'::text,
    'work_order'::text,
    'service_request'::text,
    'review_request'::text,
    'punchlist'::text,
    'test_tune'::text,
    'product_request'::text,
    'work_order_assignment'::text,
    'proposal_message'::text,
    'bug_report'::text,
    'paparazzi_photos_uploaded'::text,
    'vip_signup'::text,
    'time_adjustment_request'::text,
    'home_clock'::text,
    'proposal_approval'::text,
    'auto_clock_out'::text,
    'punchlist_service_request'::text,
    'service_request_created'::text,
    'system'::text,
    'mileage_reminder'::text,
    'service_request_kicked_back'::text,
    'service_request_resubmitted'::text
  ]));

-- -------------------------
-- 4. Trigger: notify creator when request is kicked back
-- -------------------------
CREATE OR REPLACE FUNCTION notify_creator_service_request_kicked_back()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_name text;
BEGIN
  -- Only fire when status transitions TO needs_more_info
  IF NEW.status = 'needs_more_info' AND (OLD.status IS DISTINCT FROM 'needs_more_info') THEN
    -- Get the manager's name
    SELECT full_name INTO v_manager_name
    FROM profiles
    WHERE id = NEW.kicked_back_by;

    -- Notify the original creator
    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        title,
        body,
        type,
        related_id,
        is_read,
        created_at
      ) VALUES (
        NEW.created_by,
        'Service Request Needs More Information',
        COALESCE(v_manager_name, 'A service manager') || ' has requested more information for ' || NEW.customer_name || ': ' || COALESCE(NEW.kickback_reason, 'Please review and update your request.'),
        'service_request_kicked_back',
        NEW.id,
        false,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_kickback ON service_requests;
CREATE TRIGGER trigger_notify_kickback
  AFTER UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_creator_service_request_kicked_back();

-- -------------------------
-- 5. Trigger: notify service managers when request is resubmitted
-- -------------------------
CREATE OR REPLACE FUNCTION notify_managers_service_request_resubmitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_manager record;
  v_creator_name text;
BEGIN
  -- Only fire when status transitions FROM needs_more_info back TO open
  IF NEW.status = 'open' AND OLD.status = 'needs_more_info' THEN
    -- Get the creator's name
    SELECT full_name INTO v_creator_name
    FROM profiles
    WHERE id = NEW.created_by;

    -- Notify all service managers and admins
    FOR v_service_manager IN
      SELECT p.id as user_id
      FROM profiles p
      WHERE p.role IN ('service_manager', 'admin')
        AND p.is_active = true
    LOOP
      INSERT INTO notifications (
        user_id,
        title,
        body,
        type,
        related_id,
        is_read,
        created_at
      ) VALUES (
        v_service_manager.user_id,
        'Service Request Updated & Resubmitted',
        COALESCE(v_creator_name, 'A team member') || ' has updated and resubmitted the service request for ' || NEW.customer_name,
        'service_request_resubmitted',
        NEW.id,
        false,
        now()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_resubmitted ON service_requests;
CREATE TRIGGER trigger_notify_resubmitted
  AFTER UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_managers_service_request_resubmitted();

-- -------------------------
-- 6. Index for kicked_back_by lookups
-- -------------------------
CREATE INDEX IF NOT EXISTS idx_service_requests_kicked_back_by
  ON service_requests(kicked_back_by)
  WHERE kicked_back_by IS NOT NULL;
