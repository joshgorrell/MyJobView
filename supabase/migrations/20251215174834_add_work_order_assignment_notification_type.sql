/*
  # Add Work Order Assignment Notification Type

  ## Summary
  Adds 'work_order_assignment' to the notifications type constraint to fix
  punchlist service request creation error.

  ## Changes
  - Update notifications_type_check constraint to include 'work_order_assignment'

  ## Notes
  - This type is used by the work_order_assignment_notification trigger
  - The trigger fires when work orders are assigned to technicians
*/

-- Update constraint to include work_order_assignment type
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
    'proposal_message',
    'proposal_reactivation',
    'deposit_reminder',
    'work_order_assignment'
  ));
