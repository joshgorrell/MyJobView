/*
  # Unified Proposal Messaging System with Sales Rep Visibility
  
  1. Schema Changes
    - Add contact_id to message_threads for customer identification
    - Add proposal_id to message_threads for proposal context
    - Add line_item_id to messages for item-specific questions
    - Add assigned_sales_rep_id to message_threads (tracks proposal owner)
    - Add is_read, is_internal flags to messages
    - Add messaging_visibility_scope to profiles (mirrors proposal visibility)
    - Add unread_customer_messages_count to proposals
    - Create indexes for performance
  
  2. Visibility Functions
    - get_user_proposal_visibility_scope() - determines what proposals user can see
    - can_view_message_thread() - checks if user can access thread based on proposal ownership
  
  3. RLS Policies
    - message_threads SELECT policy respects proposal visibility
    - messages SELECT policy inherits from thread visibility
    - Admins and managers with can_see_all_proposals bypass restrictions
  
  4. Notification System
    - Add notification types for customer questions and reactivation requests
*/

-- Add contact_id to message_threads for customer identification
ALTER TABLE message_threads 
ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

-- Add proposal context to message_threads
ALTER TABLE message_threads 
ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Add read and internal flags to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- Add line item context to messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES proposal_line_items(id) ON DELETE SET NULL;

-- Add messaging visibility scope to profiles (defaults to match existing behavior)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS messaging_visibility_scope text DEFAULT 'own' CHECK (messaging_visibility_scope IN ('own', 'office', 'company'));

-- Update messaging_visibility_scope to match proposal_visibility_scope for existing users
UPDATE profiles 
SET messaging_visibility_scope = COALESCE(proposal_visibility_scope, 'own')
WHERE messaging_visibility_scope IS NULL;

-- Add unread customer message count to proposals
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS unread_customer_messages_count integer DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_threads_contact_id ON message_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_proposal_id ON message_threads(proposal_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_assigned_sales_rep ON message_threads(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_messages_line_item_id ON messages(line_item_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_proposals_unread_messages ON proposals(unread_customer_messages_count) WHERE unread_customer_messages_count > 0;

-- Function to get user's proposal visibility scope
CREATE OR REPLACE FUNCTION get_user_proposal_visibility_scope(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  visibility_scope text;
  can_see_all boolean;
BEGIN
  -- Get user's role and permissions
  SELECT role, messaging_visibility_scope, can_see_all_proposals
  INTO user_role, visibility_scope, can_see_all
  FROM profiles
  WHERE id = user_id;
  
  -- Admins and managers with can_see_all_proposals see everything
  IF user_role IN ('admin', 'manager') OR can_see_all THEN
    RETURN 'company';
  END IF;
  
  -- Return the user's configured visibility scope
  RETURN COALESCE(visibility_scope, 'own');
END;
$$;

-- Function to check if user can view a message thread
CREATE OR REPLACE FUNCTION can_view_message_thread(user_id uuid, thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_proposal_id uuid;
  thread_contact_id uuid;
  thread_context text;
  user_visibility_scope text;
  user_office_id uuid;
  proposal_created_by uuid;
  proposal_office_id uuid;
  contact_assigned_to uuid;
BEGIN
  -- Get thread details
  SELECT proposal_id, contact_id, context_type
  INTO thread_proposal_id, thread_contact_id, thread_context
  FROM message_threads
  WHERE id = thread_id;
  
  -- If no proposal context, use general messaging visibility
  IF thread_proposal_id IS NULL THEN
    RETURN true; -- General messages visible to all staff for now
  END IF;
  
  -- Get user's visibility scope and office
  SELECT get_user_proposal_visibility_scope(user_id), office_id
  INTO user_visibility_scope, user_office_id
  FROM profiles
  WHERE id = user_id;
  
  -- Company-wide visibility
  IF user_visibility_scope = 'company' THEN
    RETURN true;
  END IF;
  
  -- Get proposal details
  SELECT created_by, office_id
  INTO proposal_created_by, proposal_office_id
  FROM proposals
  WHERE id = thread_proposal_id;
  
  -- Check if proposal was created by this user
  IF proposal_created_by = user_id THEN
    RETURN true;
  END IF;
  
  -- Get contact assignment
  IF thread_contact_id IS NOT NULL THEN
    SELECT assigned_to
    INTO contact_assigned_to
    FROM contacts
    WHERE id = thread_contact_id;
    
    -- Check if contact is assigned to this user
    IF contact_assigned_to = user_id THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Office-level visibility
  IF user_visibility_scope = 'office' THEN
    IF proposal_office_id = user_office_id THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$$;

-- Function to update unread customer message count for a proposal
CREATE OR REPLACE FUNCTION update_proposal_unread_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_proposal_id uuid;
  unread_count integer;
BEGIN
  -- Get proposal_id from the thread
  SELECT proposal_id INTO thread_proposal_id
  FROM message_threads
  WHERE id = NEW.thread_id;
  
  -- If no proposal context, exit
  IF thread_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Count unread messages from customers in this proposal's threads
  SELECT COUNT(*)
  INTO unread_count
  FROM messages m
  JOIN message_threads mt ON m.thread_id = mt.id
  WHERE mt.proposal_id = thread_proposal_id
    AND m.author_type = 'customer'
    AND m.is_read = false
    AND m.is_internal = false;
  
  -- Update the proposal
  UPDATE proposals
  SET unread_customer_messages_count = unread_count
  WHERE id = thread_proposal_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to update unread count when messages change
DROP TRIGGER IF EXISTS update_proposal_unread_count_trigger ON messages;
CREATE TRIGGER update_proposal_unread_count_trigger
AFTER INSERT OR UPDATE OF is_read ON messages
FOR EACH ROW
EXECUTE FUNCTION update_proposal_unread_count();

-- Add new notification types (include all existing types)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

ALTER TABLE notifications
ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_status_changed', 'task_assigned', 'task_due_soon',
  'task_completed', 'connection_due', 'feature_suggestion_comment',
  'discussion_post_reply', 'discussion_post_mention', 'lead_claim',
  'service_request_assigned', 'work_order_assigned', 'late_clock_in',
  'auto_clock_out', 'new_work_order', 'clock_review_required',
  'time_adjustment_request', 'product_request', 'punchlist_task_assigned',
  'punchlist_task_completed', 'vip_signup', 'bug_report_assigned',
  'bug_report_status_changed', 'proposal_approved', 'proposal_message',
  'proposal_reactivation_request', 'customer_question', 'staff_response',
  'message_received', 'message_reply', 'punchlist_service_request',
  'service_request_created', 'system'
));

-- Update RLS policies for message_threads to respect proposal visibility
DROP POLICY IF EXISTS "Staff can view threads in their company" ON message_threads;
CREATE POLICY "Staff can view accessible message threads"
  ON message_threads FOR SELECT
  TO authenticated
  USING (
    -- Contact users (portal users) see threads where they are linked via their contact_id
    (
      contact_id IN (SELECT contact_id FROM profiles WHERE id = auth.uid() AND contact_id IS NOT NULL)
    )
    OR
    -- Staff users see threads based on proposal visibility
    (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND contact_id IS NULL)
      AND (
        proposal_id IS NULL -- General messages visible to all staff
        OR can_view_message_thread(auth.uid(), id)
      )
    )
  );

-- Update RLS policies for messages to inherit thread visibility and respect internal flag
DROP POLICY IF EXISTS "Staff can view messages in their company threads" ON messages;
CREATE POLICY "Staff can view accessible messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_threads mt
      WHERE mt.id = thread_id
      AND (
        -- Contact users (portal users) see non-internal messages in their threads
        (
          mt.contact_id IN (SELECT contact_id FROM profiles WHERE id = auth.uid() AND contact_id IS NOT NULL)
          AND is_internal = false
        )
        OR
        -- Staff users see messages based on thread visibility (including internal)
        (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND contact_id IS NULL)
          AND (
            mt.proposal_id IS NULL -- General messages visible to all staff
            OR can_view_message_thread(auth.uid(), mt.id)
          )
        )
      )
    )
  );

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_proposal_visibility_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_message_thread(uuid, uuid) TO authenticated;

-- Create function to send notification when customer asks a question
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
    -- Get proposal number and customer name
    SELECT p.proposal_number, c.full_name
    INTO proposal_number, customer_name
    FROM proposals p
    LEFT JOIN contacts c ON p.contact_id = c.id
    WHERE p.id = thread_proposal_id;
    
    -- Create notification for sales rep
    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (
      sales_rep_id,
      'customer_question',
      'New Customer Question',
      customer_name || ' asked a question about proposal ' || COALESCE(proposal_number, 'N/A'),
      thread_proposal_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to send notification on customer question
DROP TRIGGER IF EXISTS notify_on_customer_question_trigger ON messages;
CREATE TRIGGER notify_on_customer_question_trigger
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION notify_on_customer_question();
