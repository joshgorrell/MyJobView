/*
  # Add Missing Foreign Key Indexes - Batch 1
  
  1. Performance Improvements
    - Add indexes for foreign keys without covering indexes
    - Improves query performance on joins and foreign key lookups
  
  2. Tables Updated (First 9)
    - daily_clock_entries: admin_reviewed_by
    - payment_methods: contact_id
    - product_request_items: assigned_to
    - product_request_settings: notification_user_id
    - product_requests: assigned_to
    - project_tasks: created_by
    - proposal_notifications: sent_by
    - proposals: billing_action_by
    - quickbooks_staged_customers: imported_contact_id
*/

-- Add index for daily_clock_entries.admin_reviewed_by
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_admin_reviewed_by 
ON public.daily_clock_entries(admin_reviewed_by);

-- Add index for payment_methods.contact_id
CREATE INDEX IF NOT EXISTS idx_payment_methods_contact_id 
ON public.payment_methods(contact_id);

-- Add index for product_request_items.assigned_to
CREATE INDEX IF NOT EXISTS idx_product_request_items_assigned_to 
ON public.product_request_items(assigned_to);

-- Add index for product_request_settings.notification_user_id
CREATE INDEX IF NOT EXISTS idx_product_request_settings_notification_user_id 
ON public.product_request_settings(notification_user_id);

-- Add index for product_requests.assigned_to
CREATE INDEX IF NOT EXISTS idx_product_requests_assigned_to 
ON public.product_requests(assigned_to);

-- Add index for project_tasks.created_by
CREATE INDEX IF NOT EXISTS idx_project_tasks_created_by 
ON public.project_tasks(created_by);

-- Add index for proposal_notifications.sent_by
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_sent_by 
ON public.proposal_notifications(sent_by);

-- Add index for proposals.billing_action_by
CREATE INDEX IF NOT EXISTS idx_proposals_billing_action_by 
ON public.proposals(billing_action_by);

-- Add index for quickbooks_staged_customers.imported_contact_id
CREATE INDEX IF NOT EXISTS idx_quickbooks_staged_customers_imported_contact_id 
ON public.quickbooks_staged_customers(imported_contact_id);