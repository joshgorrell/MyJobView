/*
  # Add Missing Foreign Key Indexes - Batch 4
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers lead_messages through parts_usage_log tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Lead Messages
CREATE INDEX IF NOT EXISTS idx_lead_messages_replied_to_message_id ON public.lead_messages(replied_to_message_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_user_id ON public.lead_messages(user_id);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_converted_from_contact_id ON public.leads(converted_from_contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_office_id ON public.leads(office_id);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);

-- Module Access
CREATE INDEX IF NOT EXISTS idx_module_access_granted_by ON public.module_access(granted_by);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_lead_id ON public.notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_message_id ON public.notifications(message_id);

-- Parts Requests
CREATE INDEX IF NOT EXISTS idx_parts_requests_approved_by ON public.parts_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_parts_requests_technician_id ON public.parts_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_parts_requests_work_order_id ON public.parts_requests(work_order_id);

-- Parts Usage Log
CREATE INDEX IF NOT EXISTS idx_parts_usage_log_parts_request_id ON public.parts_usage_log(parts_request_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_log_technician_id ON public.parts_usage_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_log_work_order_id ON public.parts_usage_log(work_order_id);