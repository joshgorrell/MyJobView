/*
  # Add product request notification type

  1. Changes
    - Add 'product_request' to the notifications type constraint
    - Include all existing notification types
*/

-- Add product_request to notification types
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
      'lead_assigned', 'lead_status_change', 'task_assigned', 'task_comment',
      'task_due_soon', 'proposal_status_change', 'appointment_reminder',
      'work_order_assignment', 'parts_approval', 'message_received',
      'invoice_sent', 'payment_received', 'late_clock_in', 'task_mention',
      'task_watching', 'vip_signup', 'home_clock_notification', 'auto_clocked_out',
      'service_request', 'proposal_message', 'proposal_reactivation', 'deposit_reminder',
      'product_request', 'punchlist_service_request', 'service_request_created', 'system', 'task'
    ));
END $$;
