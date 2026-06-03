/*
  # Fix notifications type constraint - add missing task_assigned type

  ## Problem
  The notifications_type_check constraint was missing 'task_assigned', which is used
  by the notify_task_assigned() trigger function when a task is assigned to a user.
  This caused "violates check constraint" errors when creating tasks with an assignee.

  ## Changes
  - Drops and recreates notifications_type_check to include 'task_assigned'
  - Preserves all 27 existing allowed types
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'lead',
    'task',
    'task_assigned',
    'appointment',
    'proposal',
    'invoice',
    'message',
    'work_order',
    'service_request',
    'review_request',
    'punchlist',
    'test_tune',
    'product_request',
    'work_order_assignment',
    'proposal_message',
    'bug_report',
    'paparazzi_photos_uploaded',
    'vip_signup',
    'time_adjustment_request',
    'home_clock',
    'proposal_approval',
    'auto_clock_out',
    'punchlist_service_request',
    'service_request_created',
    'system',
    'mileage_reminder',
    'service_request_kicked_back',
    'service_request_resubmitted'
  ]::text[]));
