/*
  # Add Missing Foreign Key Indexes - Batch 2
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers customers through gps_breadcrumbs tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_stage_id ON public.customers(stage_id);

-- Daily Clock Entries
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_adjusted_by ON public.daily_clock_entries(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_office_id ON public.daily_clock_entries(office_id);
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_technician_id ON public.daily_clock_entries(technician_id);

-- Default Starred Modules
CREATE INDEX IF NOT EXISTS idx_default_starred_modules_module_id ON public.default_starred_modules(module_id);

-- Department Access
CREATE INDEX IF NOT EXISTS idx_department_access_granted_by ON public.department_access(granted_by);

-- Discussion Post Likes
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_user_id ON public.discussion_post_likes(user_id);

-- Discussion Posts
CREATE INDEX IF NOT EXISTS idx_discussion_posts_assigned_to ON public.discussion_posts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_completed_by ON public.discussion_posts(completed_by);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_last_bumped_by ON public.discussion_posts(last_bumped_by);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_lead_id ON public.discussion_posts(lead_id);

-- Email Workflow Enrollments
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_contact_id ON public.email_workflow_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_current_step_id ON public.email_workflow_enrollments(current_step_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_lead_id ON public.email_workflow_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_workflow_id ON public.email_workflow_enrollments(workflow_id);

-- Email Workflow Logs
CREATE INDEX IF NOT EXISTS idx_email_workflow_logs_enrollment_id ON public.email_workflow_logs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_logs_step_id ON public.email_workflow_logs(step_id);

-- Email Workflow Steps
CREATE INDEX IF NOT EXISTS idx_email_workflow_steps_template_id ON public.email_workflow_steps(template_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_steps_workflow_id ON public.email_workflow_steps(workflow_id);

-- Email Workflows
CREATE INDEX IF NOT EXISTS idx_email_workflows_company_id ON public.email_workflows(company_id);

-- Feed Events
CREATE INDEX IF NOT EXISTS idx_feed_events_contact_id ON public.feed_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_discussion_post_id ON public.feed_events(discussion_post_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_lead_id ON public.feed_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_message_id ON public.feed_events(message_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_task_id ON public.feed_events(task_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_user_id ON public.feed_events(user_id);

-- File Attachments
CREATE INDEX IF NOT EXISTS idx_file_attachments_message_id ON public.file_attachments(message_id);

-- GPS Breadcrumbs
CREATE INDEX IF NOT EXISTS idx_gps_breadcrumbs_daily_clock_entry_id ON public.gps_breadcrumbs(daily_clock_entry_id);
CREATE INDEX IF NOT EXISTS idx_gps_breadcrumbs_technician_id ON public.gps_breadcrumbs(technician_id);
CREATE INDEX IF NOT EXISTS idx_gps_breadcrumbs_work_order_id ON public.gps_breadcrumbs(work_order_id);