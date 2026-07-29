/*
  # Proposal Q&A: Backfill assigned_sales_rep_id + Email Notification Trigger

  ## 1. Backfill message_threads.assigned_sales_rep_id
  Existing proposal-context threads may have a NULL assigned_sales_rep_id.
  This update populates them from the linked proposal's created_by field.

  ## 2. Add 'customer_question' to notifications type check constraint
  Expands the existing check constraint to include the new notification type.

  ## 3. Create trigger function for customer message insert
  When a customer sends a message (author_type = 'customer', is_internal = false),
  this trigger inserts a notification row for the thread's assigned_sales_rep_id
  and invokes the send-proposal-question-email edge function via pg_net.

  ## 4. Create the trigger on messages table
  Fires AFTER INSERT on messages for customer messages only.
*/

-- ── 1. Backfill assigned_sales_rep_id ──────────────────────────────────
UPDATE message_threads
SET assigned_sales_rep_id = p.created_by
FROM proposals p
WHERE message_threads.proposal_id = p.id
  AND message_threads.assigned_sales_rep_id IS NULL;

-- ── 2. Expand notifications type check constraint ─────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'lead', 'task', 'task_assigned', 'appointment', 'proposal', 'invoice',
    'message', 'work_order', 'service_request', 'review_request', 'punchlist',
    'test_tune', 'product_request', 'work_order_assignment', 'proposal_message',
    'bug_report', 'paparazzi_photos_uploaded', 'vip_signup', 'time_adjustment_request',
    'home_clock', 'proposal_approval', 'auto_clock_out', 'punchlist_service_request',
    'service_request_created', 'system', 'mileage_reminder', 'service_request_kicked_back',
    'service_request_resubmitted', 'internal_time_request_submitted',
    'internal_time_request_approved', 'internal_time_request_denied',
    'customer_question'
  ]));

-- ── 3. Trigger function: notify on customer message insert ────────────
CREATE OR REPLACE FUNCTION notify_customer_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread message_threads%ROWTYPE;
  v_proposal RECORD;
  v_rep_email text;
  v_rep_name text;
  v_customer_name text;
  v_org_id uuid;
  v_net_url text;
  v_anon_key text;
  v_payload jsonb;
BEGIN
  IF NEW.author_type <> 'customer' OR COALESCE(NEW.is_internal, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_thread FROM message_threads WHERE id = NEW.thread_id;

  IF NOT FOUND OR v_thread.assigned_sales_rep_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org_id := v_thread.organization_id;

  -- Insert in-app notification for the assigned rep
  INSERT INTO notifications (
    organization_id, user_id, type, title, body,
    related_id, is_read, created_at
  )
  VALUES (
    v_org_id,
    v_thread.assigned_sales_rep_id,
    'customer_question',
    'New question on ' || COALESCE(v_thread.subject, 'a proposal'),
    LEFT(NEW.body, 200),
    v_thread.proposal_id,
    false,
    now()
  );

  -- Gather data for email
  SELECT p.proposal_number, p.title, c.full_name
  INTO v_proposal
  FROM proposals p
  LEFT JOIN contacts c ON c.id = p.contact_id
  WHERE p.id = v_thread.proposal_id;

  SELECT pr.email, pr.full_name
  INTO v_rep_email, v_rep_name
  FROM profiles pr
  WHERE pr.id = v_thread.assigned_sales_rep_id;

  v_customer_name := COALESCE(v_proposal.full_name, NEW.author_name, 'Customer');

  v_net_url := current_setting('app.supabase_url', true);
  IF v_net_url IS NULL OR v_net_url = '' THEN
    v_net_url := '';
  END IF;
  v_anon_key := current_setting('app.supabase_anon_key', true);

  v_payload := jsonb_build_object(
    'threadId', NEW.thread_id,
    'messageId', NEW.id,
    'messageBody', NEW.body,
    'contextLabel', NEW.context_label,
    'proposalNumber', v_proposal.proposal_number,
    'proposalTitle', v_proposal.title,
    'proposalId', v_thread.proposal_id,
    'customerName', v_customer_name,
    'repEmail', v_rep_email,
    'repName', v_rep_name,
    'authorName', NEW.author_name
  );

  BEGIN
    IF v_net_url IS NOT NULL AND v_net_url <> '' THEN
      PERFORM net.http_post(
        url := v_net_url || '/functions/v1/send-proposal-question-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := v_payload
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- ── 4. Create the trigger ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_customer_question_insert ON messages;
CREATE TRIGGER on_customer_question_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_customer_question();
