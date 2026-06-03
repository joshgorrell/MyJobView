/*
  # Fix Activity Feed References

  1. Issue
    - Multiple triggers reference 'activity_feed' table which doesn't exist
    - Should use 'notifications' table instead

  2. Changes
    - Remove all activity_feed inserts from triggers
    - Use notifications table for user-facing events only
*/

-- Fix service request completion trigger
CREATE OR REPLACE FUNCTION handle_service_request_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only process when moving from 'in_progress' to 'completed'
  IF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
    -- Create notification for the customer
    IF NEW.contact_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        related_id
      )
      SELECT
        auth.uid(),
        'service_completed',
        'Service Request Completed',
        'Service request #' || NEW.id || ' has been completed',
        NEW.id
      WHERE EXISTS (SELECT 1 FROM contacts WHERE id = NEW.contact_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix deposit payment notification trigger
CREATE OR REPLACE FUNCTION notify_deposit_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only notify when deposit_paid changes from false to true
  IF OLD.deposit_paid = false AND NEW.deposit_paid = true THEN
    -- Create notification for proposal creator
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id,
      created_at
    ) VALUES (
      NEW.created_by,
      'deposit_received',
      'Deposit Received',
      'Deposit payment received for proposal ' || NEW.proposal_number,
      NEW.id,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Fix deposit request trigger
CREATE OR REPLACE FUNCTION notify_deposit_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only notify when deposit_request_sent changes to true
  IF OLD.deposit_request_sent = false AND NEW.deposit_request_sent = true THEN
    -- Create notification for proposal creator
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id,
      created_at
    ) VALUES (
      NEW.created_by,
      'deposit_requested',
      'Deposit Request Sent',
      'Deposit request sent for proposal ' || NEW.proposal_number,
      NEW.id,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_service_request_completion() IS 'Notifies customer when service request is completed';
COMMENT ON FUNCTION notify_deposit_payment() IS 'Notifies proposal creator when deposit is received';
COMMENT ON FUNCTION notify_deposit_request() IS 'Notifies proposal creator when deposit request is sent';
