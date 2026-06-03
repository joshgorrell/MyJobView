/*
  # Time Request Notification System

  ## Summary
  Adds full notification routing for Shop Time and Training Time requests submitted
  from the Time Clock command center. Approvers receive bell notifications and emails
  when a tech submits a request. The requesting tech receives a bell notification when
  their request is approved or denied.

  ## Changes

  ### 1. company_settings
  - Add `time_request_approver_ids` (uuid[], default '{}') — stores the user IDs
    of profiles who should be notified and can approve/deny time requests.

  ### 2. notifications.type CHECK constraint
  - Add three new values:
    - `internal_time_request_submitted` — sent to each approver when a tech submits
    - `internal_time_request_approved` — sent to the tech when approved
    - `internal_time_request_denied`   — sent to the tech when denied

  ### 3. DB trigger on internal_time_sessions INSERT
  - Function: `notify_approvers_of_time_request()`
  - Reads `time_request_approver_ids` from `company_settings`
  - Inserts one notification row per approver with related_id = session ID

  ### 4. DB trigger on internal_time_sessions UPDATE
  - Function: `notify_tech_of_time_request_outcome()`
  - Fires when status transitions to 'scheduled' (approved) or 'denied'
  - Inserts a notification to the requesting tech (assigned_to)
*/

-- 1. Add approver IDs column to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'time_request_approver_ids'
  ) THEN
    ALTER TABLE company_settings
      ADD COLUMN time_request_approver_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- 2. Drop and recreate the notifications type CHECK constraint to include new types
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'lead',
    'task',
    'task_assigned',
    'appointment',
    'proposal',
    'invoice',
    'message',
    'work_order',
    'service_request',
    'review_request',
    'punchlist',
    'test_tune',
    'product_request',
    'work_order_assignment',
    'proposal_message',
    'bug_report',
    'paparazzi_photos_uploaded',
    'vip_signup',
    'time_adjustment_request',
    'home_clock',
    'proposal_approval',
    'auto_clock_out',
    'punchlist_service_request',
    'service_request_created',
    'system',
    'mileage_reminder',
    'service_request_kicked_back',
    'service_request_resubmitted',
    'internal_time_request_submitted',
    'internal_time_request_approved',
    'internal_time_request_denied'
  ));

-- 3. Trigger function: notify approvers when a time request is submitted
CREATE OR REPLACE FUNCTION notify_approvers_of_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_ids uuid[];
  v_approver_id  uuid;
  v_tech_name    text;
  v_session_type text;
  v_hours        numeric;
  v_title        text;
  v_body         text;
BEGIN
  -- Only fire on new pending_approval inserts
  IF NEW.status <> 'pending_approval' THEN
    RETURN NEW;
  END IF;

  -- Get approver list from company_settings
  SELECT time_request_approver_ids
    INTO v_approver_ids
    FROM company_settings
   LIMIT 1;

  IF v_approver_ids IS NULL OR array_length(v_approver_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve tech's display name
  SELECT COALESCE(full_name, email, 'A technician')
    INTO v_tech_name
    FROM profiles
   WHERE id = NEW.assigned_to;

  v_session_type := CASE NEW.session_type
    WHEN 'shop_time'  THEN 'Shop Time'
    WHEN 'training'   THEN 'Training Time'
    ELSE initcap(replace(NEW.session_type, '_', ' '))
  END;

  v_hours := COALESCE(NEW.predetermined_hours, 0);

  v_title := v_tech_name || ' requested ' || v_session_type;
  v_body  := v_session_type || ' request for ' ||
             v_hours::text || ' hour(s)' ||
             CASE WHEN NEW.request_reason IS NOT NULL AND NEW.request_reason <> ''
                  THEN ': ' || NEW.request_reason
                  ELSE ''
             END;

  -- Insert one notification per approver
  FOREACH v_approver_id IN ARRAY v_approver_ids
  LOOP
    INSERT INTO notifications (user_id, type, title, body, related_id, is_read)
    VALUES (
      v_approver_id,
      'internal_time_request_submitted',
      v_title,
      v_body,
      NEW.id,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_approvers_time_request ON internal_time_sessions;
CREATE TRIGGER trigger_notify_approvers_time_request
  AFTER INSERT ON internal_time_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_approvers_of_time_request();

-- 4. Trigger function: notify tech when request is approved or denied
CREATE OR REPLACE FUNCTION notify_tech_of_time_request_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_name text;
  v_session_type  text;
  v_hours         numeric;
  v_title         text;
  v_body          text;
  v_notif_type    text;
BEGIN
  -- Only fire when status transitions from pending_approval to scheduled or denied
  IF OLD.status <> 'pending_approval' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('scheduled', 'denied') THEN
    RETURN NEW;
  END IF;

  -- Resolve approver name
  SELECT COALESCE(full_name, email, 'A manager')
    INTO v_approver_name
    FROM profiles
   WHERE id = NEW.approved_by;

  v_session_type := CASE NEW.session_type
    WHEN 'shop_time'  THEN 'Shop Time'
    WHEN 'training'   THEN 'Training Time'
    ELSE initcap(replace(NEW.session_type, '_', ' '))
  END;

  v_hours := COALESCE(NEW.predetermined_hours, 0);

  IF NEW.status = 'scheduled' THEN
    v_notif_type := 'internal_time_request_approved';
    v_title      := v_session_type || ' request approved';
    v_body       := v_approver_name || ' approved your ' || v_session_type ||
                    ' request (' || v_hours::text || ' hr' ||
                    CASE WHEN v_hours <> 1 THEN 's' ELSE '' END || ').' ||
                    ' It will appear in your schedule.';
  ELSE
    v_notif_type := 'internal_time_request_denied';
    v_title      := v_session_type || ' request declined';
    v_body       := v_approver_name || ' declined your ' || v_session_type || ' request.' ||
                    CASE WHEN NEW.denial_reason IS NOT NULL AND NEW.denial_reason <> ''
                         THEN ' Reason: ' || NEW.denial_reason
                         ELSE ''
                    END;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, related_id, is_read)
  VALUES (
    NEW.assigned_to,
    v_notif_type,
    v_title,
    v_body,
    NEW.id,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_tech_time_request_outcome ON internal_time_sessions;
CREATE TRIGGER trigger_notify_tech_time_request_outcome
  AFTER UPDATE ON internal_time_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_tech_of_time_request_outcome();
