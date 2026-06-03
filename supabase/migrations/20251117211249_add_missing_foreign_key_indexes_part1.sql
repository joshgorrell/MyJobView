/*
  # Add Missing Foreign Key Indexes - Part 1

  ## Overview
  Adds indexes for all unindexed foreign keys to improve query performance.
  Foreign keys without indexes can cause severe performance degradation on joins and lookups.

  ## Changes
  - Add indexes for foreign keys in change_orders table
  - Add indexes for foreign keys in crew_assignments table
  - Add indexes for foreign keys in daily_clock_entries table
  - Add indexes for foreign keys in default_starred_modules table
  - Add indexes for foreign keys in department_access table
  - Add indexes for foreign keys in department_user_overrides table
  - Add indexes for foreign keys in email workflow tables
  - Add indexes for foreign keys in job-related tables
  - Add indexes for foreign keys in module access tables
  - Add indexes for foreign keys in parts requests table
  - Add indexes for foreign keys in products table
  - Add indexes for foreign keys in punch list tables
  - Add indexes for foreign keys in purchase order tables
*/

-- Change orders
CREATE INDEX IF NOT EXISTS idx_change_orders_approved_by ON public.change_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_change_orders_requested_by ON public.change_orders(requested_by);

-- Crew assignments
CREATE INDEX IF NOT EXISTS idx_crew_assignments_created_by ON public.crew_assignments(created_by);

-- Daily clock entries
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_adjusted_by ON public.daily_clock_entries(adjusted_by);

-- Default starred modules
CREATE INDEX IF NOT EXISTS idx_default_starred_modules_module_id ON public.default_starred_modules(module_id);

-- Department access
CREATE INDEX IF NOT EXISTS idx_department_access_granted_by ON public.department_access(granted_by);

-- Department user overrides
CREATE INDEX IF NOT EXISTS idx_department_user_overrides_department_id ON public.department_user_overrides(department_id);

-- Email workflow enrollments
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_current_step_id ON public.email_workflow_enrollments(current_step_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_enrollments_workflow_id ON public.email_workflow_enrollments(workflow_id);

-- Email workflow logs
CREATE INDEX IF NOT EXISTS idx_email_workflow_logs_step_id ON public.email_workflow_logs(step_id);

-- Email workflow steps
CREATE INDEX IF NOT EXISTS idx_email_workflow_steps_template_id ON public.email_workflow_steps(template_id);

-- Email workflows
CREATE INDEX IF NOT EXISTS idx_email_workflows_company_id ON public.email_workflows(company_id);

-- Job completions
CREATE INDEX IF NOT EXISTS idx_job_completions_template_id ON public.job_completions(template_id);

-- Job merge sources
CREATE INDEX IF NOT EXISTS idx_job_merge_sources_source_work_order_id ON public.job_merge_sources(source_work_order_id);

-- Job merges
CREATE INDEX IF NOT EXISTS idx_job_merges_merged_by ON public.job_merges(merged_by);

-- Job splits
CREATE INDEX IF NOT EXISTS idx_job_splits_created_by ON public.job_splits(created_by);

-- Module access
CREATE INDEX IF NOT EXISTS idx_module_access_granted_by ON public.module_access(granted_by);

-- Module user overrides
CREATE INDEX IF NOT EXISTS idx_module_user_overrides_module_id ON public.module_user_overrides(module_id);

-- Parts requests
CREATE INDEX IF NOT EXISTS idx_parts_requests_approved_by ON public.parts_requests(approved_by);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products(vendor_id);

-- Punch list items
CREATE INDEX IF NOT EXISTS idx_punch_list_items_assigned_to ON public.punch_list_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_punch_list_items_completed_by ON public.punch_list_items(completed_by);

-- Punch lists
CREATE INDEX IF NOT EXISTS idx_punch_lists_created_by ON public.punch_lists(created_by);

-- Purchase order items
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items(product_id);

-- Purchase orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_id ON public.purchase_orders(warehouse_id);
