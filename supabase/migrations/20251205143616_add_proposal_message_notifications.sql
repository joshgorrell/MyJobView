/*
  # Add Proposal Message Notifications

  1. Changes
    - Create trigger to generate notifications when customers send proposal messages
    - Notifications sent to proposal owner
    - Only creates notifications for unread customer messages

  2. Implementation
    - Function to create notification on new customer message
    - Trigger fires after INSERT on proposal_messages
    - Add 'proposal_message' to allowed notification types
*/

-- Function to create notification when customer sends a proposal message
CREATE OR REPLACE FUNCTION notify_rep_of_proposal_message()
RETURNS TRIGGER AS $$
DECLARE
  v_proposal_title text;
  v_proposal_owner uuid;
  v_proposal_number text;
BEGIN
  -- Only create notification for customer messages
  IF NEW.sender_type = 'customer' THEN
    -- Get proposal details
    SELECT title, created_by, proposal_number
    INTO v_proposal_title, v_proposal_owner, v_proposal_number
    FROM proposals
    WHERE id = NEW.proposal_id;

    -- Create notification for the proposal owner (sales rep)
    IF v_proposal_owner IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        title,
        body,
        type,
        is_read,
        created_at
      ) VALUES (
        v_proposal_owner,
        'New Customer Message',
        'Customer sent a message on proposal: ' || COALESCE(v_proposal_title, v_proposal_number),
        'proposal_message',
        false,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_rep_of_proposal_message ON proposal_messages;
CREATE TRIGGER trigger_notify_rep_of_proposal_message
  AFTER INSERT ON proposal_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_rep_of_proposal_message();

-- Update constraint to include proposal_message type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'lead_assigned',
    'fishbowl_lead',
    'escalated',
    'mention',
    'lead_claimed',
    'lead_updated',
    'task',
    'task_assigned',
    'task_completed',
    'service_request_created',
    'punchlist_service_request',
    'service_request_assigned',
    'proposal_message'
  ));
