/*
  # Fix Bug Report Notification Type Constraint

  1. Changes
    - Add 'bug_report' to the notifications_type_check constraint
    - This allows the notify_bug_report() trigger to insert notifications with type 'bug_report'

  2. Notes
    - The trigger was trying to use 'bug_report' type but it wasn't in the allowed list
    - This fixes the constraint violation error when submitting bug reports
*/

-- Drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate the constraint with 'bug_report' added to the list
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'lead_assigned',
    'lead_status_changed',
    'task_assigned',
    'task_due_soon',
    'task_completed',
    'connection_due',
    'feature_suggestion_comment',
    'discussion_post_reply',
    'discussion_post_mention',
    'lead_claim',
    'service_request_assigned',
    'work_order_assigned',
    'late_clock_in',
    'auto_clock_out',
    'new_work_order',
    'clock_review_required',
    'time_adjustment_request',
    'product_request',
    'punchlist_task_assigned',
    'punchlist_task_completed',
    'vip_signup',
    'bug_report',
    'bug_report_assigned',
    'bug_report_status_changed',
    'proposal_approved',
    'proposal_message',
    'proposal_reactivation_request',
    'customer_question',
    'staff_response',
    'message_received',
    'message_reply',
    'punchlist_service_request',
    'service_request_created',
    'system'
  ]::text[]));
