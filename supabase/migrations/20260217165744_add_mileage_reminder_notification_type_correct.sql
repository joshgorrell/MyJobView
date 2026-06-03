-- Add mileage_reminder to notification types constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'lead',
  'task',
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
  'mileage_reminder'
));