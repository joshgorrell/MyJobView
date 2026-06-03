/*
  # Fix Customer Message Notifications

  1. Changes
    - Update notify_on_customer_question function to include organization_id
    - Ensure sales rep gets notified when customer sends a message from portal

  2. Security
    - Function runs as SECURITY DEFINER
    - Only processes customer messages (not internal staff messages)
*/

-- Update function to include organization_id in notifications
CREATE OR REPLACE FUNCTION notify_on_customer_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_proposal_id uuid;
  sales_rep_id uuid;
  proposal_number text;
  customer_name text;
  org_id uuid;
BEGIN
  -- Only process customer messages
  IF NEW.author_type != 'customer' OR NEW.is_internal = true THEN
    RETURN NEW;
  END IF;

  -- Get proposal context
  SELECT proposal_id, assigned_sales_rep_id
  INTO thread_proposal_id, sales_rep_id
  FROM message_threads
  WHERE id = NEW.thread_id;

  -- Only notify if this is a proposal-related message
  IF thread_proposal_id IS NOT NULL AND sales_rep_id IS NOT NULL THEN
    -- Get proposal number, customer name, and organization_id
    SELECT p.proposal_number, c.full_name, p.organization_id
    INTO proposal_number, customer_name, org_id
    FROM proposals p
    LEFT JOIN contacts c ON p.contact_id = c.id
    WHERE p.id = thread_proposal_id;

    -- Create notification for sales rep
    INSERT INTO notifications (user_id, organization_id, type, title, message, related_id)
    VALUES (
      sales_rep_id,
      org_id,
      'customer_question',
      'New Customer Question',
      customer_name || ' asked a question about proposal ' || COALESCE(proposal_number, 'N/A'),
      thread_proposal_id
    );
  END IF;

  RETURN NEW;
END;
$$;
