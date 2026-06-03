/*
  # Add Deposit Payment Tracking and Notifications

  1. Changes
    - Track when customer approves but doesn't complete payment
    - Add notifications for sales rep to follow up
    - Add customer reminder notifications
    - Track deposit request attempts

  2. Notifications
    - Sales rep notified when order is pending deposit
    - Customer gets reminder to complete payment
    - Activity feed updates for transparency
*/

-- Add deposit payment tracking fields
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS deposit_reminder_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_deposit_reminder_sent_at timestamptz;

-- Function to create notifications when deposit is pending
CREATE OR REPLACE FUNCTION notify_pending_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_rep_name text;
  v_customer_name text;
  v_customer_email text;
  v_company_name text;
BEGIN
  -- Only run when status changes to approved and deposit is not paid
  IF NEW.status = 'approved' 
     AND OLD.status != 'approved' 
     AND NEW.require_deposit = true 
     AND COALESCE(NEW.deposit_paid, false) = false THEN
    
    -- Get sales rep info
    SELECT full_name INTO v_sales_rep_name
    FROM profiles
    WHERE id = NEW.created_by;

    -- Get customer info
    SELECT full_name, email INTO v_customer_name, v_customer_email
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Get company name
    SELECT company_name INTO v_company_name
    FROM company_settings
    WHERE id = NEW.company_id;

    -- Notify sales rep - follow up needed
    INSERT INTO activity_feed (
      company_id,
      user_id,
      activity_type,
      entity_type,
      entity_id,
      title,
      description,
      created_at
    ) VALUES (
      NEW.company_id,
      NEW.created_by,
      'action_required',
      'proposal',
      NEW.id,
      'Follow Up Required: Deposit Pending',
      'Proposal ' || NEW.proposal_number || ' was approved by ' || COALESCE(v_customer_name, 'customer') || 
      ' but deposit payment was not completed. Sales Order created with pending status. Please follow up to collect $' ||
      NEW.deposit_amount_due::text || ' deposit.',
      now()
    );

    -- Create notification record for sales rep
    INSERT INTO notifications (
      company_id,
      user_id,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      created_at
    ) VALUES (
      NEW.company_id,
      NEW.created_by,
      'deposit_pending',
      'Deposit Payment Needed',
      'Customer approved proposal ' || NEW.proposal_number || ' but needs to complete $' || 
      NEW.deposit_amount_due::text || ' deposit payment.',
      'proposal',
      NEW.id,
      now()
    );

    -- Log activity for customer reminder (can be sent via email function)
    INSERT INTO activity_feed (
      company_id,
      activity_type,
      entity_type,
      entity_id,
      title,
      description,
      metadata,
      created_at
    ) VALUES (
      NEW.company_id,
      'customer_reminder_needed',
      'proposal',
      NEW.id,
      'Customer Deposit Reminder Needed',
      'Send reminder to ' || COALESCE(v_customer_name, 'customer') || ' (' || COALESCE(v_customer_email, 'no email') || 
      ') to complete $' || NEW.deposit_amount_due::text || ' deposit for proposal ' || NEW.proposal_number,
      jsonb_build_object(
        'contact_id', NEW.contact_id,
        'customer_email', v_customer_email,
        'customer_name', v_customer_name,
        'proposal_number', NEW.proposal_number,
        'deposit_amount', NEW.deposit_amount_due,
        'company_name', v_company_name
      ),
      now()
    );

  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for pending deposit notifications
DROP TRIGGER IF EXISTS notify_pending_deposit_trigger ON proposals;
CREATE TRIGGER notify_pending_deposit_trigger
  AFTER UPDATE ON proposals
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
  EXECUTE FUNCTION notify_pending_deposit();

-- Function to send deposit completion notifications
CREATE OR REPLACE FUNCTION notify_deposit_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_name text;
BEGIN
  -- Only run when deposit_paid changes from false to true
  IF NEW.deposit_paid = true AND COALESCE(OLD.deposit_paid, false) = false THEN
    
    -- Get customer info
    SELECT full_name INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Notify sales rep - deposit received
    INSERT INTO activity_feed (
      company_id,
      user_id,
      activity_type,
      entity_type,
      entity_id,
      title,
      description,
      created_at
    ) VALUES (
      NEW.company_id,
      NEW.created_by,
      'deposit_received',
      'proposal',
      NEW.id,
      'Deposit Received',
      'Deposit of $' || NEW.deposit_amount_due::text || ' received for proposal ' || NEW.proposal_number || 
      '. Sales Order is now ready for scheduling.',
      now()
    );

    -- Create notification for sales rep
    INSERT INTO notifications (
      company_id,
      user_id,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      created_at
    ) VALUES (
      NEW.company_id,
      NEW.created_by,
      'deposit_received',
      'Deposit Payment Received',
      'Deposit received for proposal ' || NEW.proposal_number || '. Order is ready for scheduling.',
      'proposal',
      NEW.id,
      now()
    );

  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for deposit completion notifications
DROP TRIGGER IF EXISTS notify_deposit_completed_trigger ON proposals;
CREATE TRIGGER notify_deposit_completed_trigger
  AFTER UPDATE ON proposals
  FOR EACH ROW
  WHEN (NEW.deposit_paid IS DISTINCT FROM OLD.deposit_paid)
  EXECUTE FUNCTION notify_deposit_completed();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposals_pending_deposits ON proposals(company_id, status, deposit_paid) 
  WHERE status = 'approved' AND deposit_paid = false;

CREATE INDEX IF NOT EXISTS idx_proposals_deposit_reminders ON proposals(company_id, last_deposit_reminder_sent_at)
  WHERE status = 'approved' AND deposit_paid = false;

COMMENT ON COLUMN proposals.deposit_reminder_count IS 'Number of reminders sent to customer about completing deposit payment';
COMMENT ON COLUMN proposals.last_deposit_reminder_sent_at IS 'Timestamp of last deposit reminder sent to customer';
COMMENT ON FUNCTION notify_pending_deposit() IS 'Notifies sales rep and logs customer reminder when proposal approved but deposit not paid';
COMMENT ON FUNCTION notify_deposit_completed() IS 'Notifies sales rep when deposit payment is received';
