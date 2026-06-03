/*
  # Add Proposal Reactivation Notification Type

  1. Changes
    - Add 'proposal_reactivation' to the notifications type constraint
    
  2. Notes
    - This allows the reactivation request system to create notifications
*/

-- Update constraint to include proposal_reactivation type
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
    'deposit_reminder'
  ));
