/*
  # Add Missing Foreign Key Indexes - Batch 1
  
  1. Performance Improvements
    - Add indexes for unindexed foreign keys in jobs schema tables
    - Add indexes for unindexed foreign keys in public schema tables
    
  2. Purpose
    - Improves query performance for foreign key lookups
    - Reduces table scan overhead
    - Optimizes JOIN operations
*/

-- Jobs schema - Appointments table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_appointments_contact_id_fkey ON jobs.appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_appointments_created_by_fkey ON jobs.appointments(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_appointments_project_id_fkey ON jobs.appointments(project_id);

-- Jobs schema - Invoices table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_invoices_contact_id_fkey ON jobs.invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_invoices_project_id_fkey ON jobs.invoices(project_id);

-- Jobs schema - Message threads table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_message_threads_contact_id_fkey ON jobs.message_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_message_threads_created_by_fkey ON jobs.message_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_message_threads_project_id_fkey ON jobs.message_threads(project_id);

-- Jobs schema - Messages table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_messages_thread_id_fkey ON jobs.messages(thread_id);

-- Jobs schema - Payments table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_payments_contact_id_fkey ON jobs.payments(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_payments_created_by_fkey ON jobs.payments(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_payments_invoice_id_fkey ON jobs.payments(invoice_id);

-- Jobs schema - Projects table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_projects_contact_id_fkey ON jobs.projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_projects_office_id_fkey ON jobs.projects(office_id);
CREATE INDEX IF NOT EXISTS idx_jobs_projects_proposal_id_fkey ON jobs.projects(proposal_id);

-- Public schema indexes
CREATE INDEX IF NOT EXISTS idx_calendar_members_added_by_fkey ON public.calendar_members(added_by);
CREATE INDEX IF NOT EXISTS idx_change_order_documents_uploaded_by_fkey ON public.change_order_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_clock_out_rewards_log_technician_id_fkey ON public.clock_out_rewards_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tax_jurisdiction_id_fkey ON public.invoices(tax_jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_pending_punchlist_invites_reviewed_by_fkey ON public.pending_punchlist_invites(reviewed_by);