/*
  # Add related_id to notifications

  1. Changes
    - Add related_id column to notifications table
    - This allows storing proposal_id, work_order_id, etc. for context
    - Update trigger to include proposal_id in related_id field
*/

-- Add related_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'related_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN related_id uuid;
  END IF;
END $$;

-- Add index for related_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON notifications(related_id);

-- Update the trigger function to store proposal_id in related_id
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
        related_id,
        is_read,
        created_at
      ) VALUES (
        v_proposal_owner,
        'New Customer Message',
        'Customer sent a message on proposal: ' || COALESCE(v_proposal_title, v_proposal_number),
        'proposal_message',
        NEW.proposal_id,
        false,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
