/*
  # Add Missing Foreign Key Indexes - Batch 2
  
  1. Performance Improvements
    - Add indexes for remaining foreign keys without covering indexes
    - Improves query performance on joins and foreign key lookups
  
  2. Tables Updated (Remaining 9)
    - quickbooks_sync_logs: processed_by
    - recurring_subscriptions: payment_method_id
    - signup_attempts: contact_id, selected_plan_id
    - subscription_payments: created_by, payment_method_id
    - time_adjustment_requests: reviewed_by
    - trip_segments: daily_clock_entry_id
    - work_order_tasks: completed_by
*/

-- Add index for quickbooks_sync_logs.processed_by
CREATE INDEX IF NOT EXISTS idx_quickbooks_sync_logs_processed_by 
ON public.quickbooks_sync_logs(processed_by);

-- Add index for recurring_subscriptions.payment_method_id
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_payment_method_id 
ON public.recurring_subscriptions(payment_method_id);

-- Add index for signup_attempts.contact_id
CREATE INDEX IF NOT EXISTS idx_signup_attempts_contact_id 
ON public.signup_attempts(contact_id);

-- Add index for signup_attempts.selected_plan_id
CREATE INDEX IF NOT EXISTS idx_signup_attempts_selected_plan_id 
ON public.signup_attempts(selected_plan_id);

-- Add index for subscription_payments.created_by
CREATE INDEX IF NOT EXISTS idx_subscription_payments_created_by 
ON public.subscription_payments(created_by);

-- Add index for subscription_payments.payment_method_id
CREATE INDEX IF NOT EXISTS idx_subscription_payments_payment_method_id 
ON public.subscription_payments(payment_method_id);

-- Add index for time_adjustment_requests.reviewed_by
CREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_reviewed_by 
ON public.time_adjustment_requests(reviewed_by);

-- Add index for trip_segments.daily_clock_entry_id
CREATE INDEX IF NOT EXISTS idx_trip_segments_daily_clock_entry_id 
ON public.trip_segments(daily_clock_entry_id);

-- Add index for work_order_tasks.completed_by
CREATE INDEX IF NOT EXISTS idx_work_order_tasks_completed_by 
ON public.work_order_tasks(completed_by);