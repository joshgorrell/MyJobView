/*
  # Add Missing Foreign Key Indexes - Batch 3
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers invoice through job tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Invoice Line Items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_contact_id ON public.invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_office_id ON public.invoices(office_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);

-- Issue Reports
CREATE INDEX IF NOT EXISTS idx_issue_reports_user_id ON public.issue_reports(user_id);

-- Job Acceptance Log
CREATE INDEX IF NOT EXISTS idx_job_acceptance_log_technician_id ON public.job_acceptance_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_acceptance_log_work_order_id ON public.job_acceptance_log(work_order_id);

-- Job Completions
CREATE INDEX IF NOT EXISTS idx_job_completions_technician_id ON public.job_completions(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_template_id ON public.job_completions(template_id);

-- Job Merge Sources
CREATE INDEX IF NOT EXISTS idx_job_merge_sources_job_merge_id ON public.job_merge_sources(job_merge_id);
CREATE INDEX IF NOT EXISTS idx_job_merge_sources_source_work_order_id ON public.job_merge_sources(source_work_order_id);

-- Job Merges
CREATE INDEX IF NOT EXISTS idx_job_merges_merged_by ON public.job_merges(merged_by);
CREATE INDEX IF NOT EXISTS idx_job_merges_target_work_order_id ON public.job_merges(target_work_order_id);

-- Job Photos
CREATE INDEX IF NOT EXISTS idx_job_photos_technician_id ON public.job_photos(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_work_order_id ON public.job_photos(work_order_id);

-- Job Split Parts
CREATE INDEX IF NOT EXISTS idx_job_split_parts_assigned_to ON public.job_split_parts(assigned_to);

-- Job Splits
CREATE INDEX IF NOT EXISTS idx_job_splits_created_by ON public.job_splits(created_by);
CREATE INDEX IF NOT EXISTS idx_job_splits_parent_work_order_id ON public.job_splits(parent_work_order_id);

-- Job Status History
CREATE INDEX IF NOT EXISTS idx_job_status_history_technician_id ON public.job_status_history(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_status_history_work_order_id ON public.job_status_history(work_order_id);