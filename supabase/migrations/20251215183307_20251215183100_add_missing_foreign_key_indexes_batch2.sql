/*
  # Add Missing Foreign Key Indexes - Batch 2
  
  1. Performance Improvements
    - Add indexes for product and proposal related foreign keys
    - Add indexes for PTO and punchlist related foreign keys
    - Add indexes for review and security contract related foreign keys
    
  2. Purpose
    - Improves query performance for foreign key lookups
    - Reduces table scan overhead
    - Optimizes JOIN operations
*/

-- Product related indexes
CREATE INDEX IF NOT EXISTS idx_product_accessories_accessory_product_id_fkey ON public.product_accessories(accessory_product_id);
CREATE INDEX IF NOT EXISTS idx_product_package_items_product_id_fkey ON public.product_package_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_category_id_fkey ON public.product_packages(category_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_labor_phase_id_fkey ON public.product_packages(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_products_default_vendor_id_fkey ON public.products(default_vendor_id);

-- Proposal related indexes
CREATE INDEX IF NOT EXISTS idx_proposal_area_templates_company_id_fkey ON public.proposal_area_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_proposal_reactivation_requests_processed_by_fkey ON public.proposal_reactivation_requests(processed_by);
CREATE INDEX IF NOT EXISTS idx_proposal_reactivation_requests_sales_rep_id_fkey ON public.proposal_reactivation_requests(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_proposal_reactivation_requests_task_id_fkey ON public.proposal_reactivation_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_proposal_report_templates_created_by_fkey ON public.proposal_report_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_proposal_settings_contract_id_fkey ON public.proposal_settings(contract_id);
CREATE INDEX IF NOT EXISTS idx_proposals_approved_by_fkey ON public.proposals(approved_by);
CREATE INDEX IF NOT EXISTS idx_proposals_tax_jurisdiction_id_fkey ON public.proposals(tax_jurisdiction_id);

-- PTO related indexes
CREATE INDEX IF NOT EXISTS idx_pto_accrual_history_created_by_fkey ON public.pto_accrual_history(created_by);
CREATE INDEX IF NOT EXISTS idx_pto_accrual_history_policy_id_fkey ON public.pto_accrual_history(policy_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_policy_id_fkey ON public.pto_requests(policy_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_reviewed_by_fkey ON public.pto_requests(reviewed_by);

-- Punchlist related indexes
CREATE INDEX IF NOT EXISTS idx_punchlist_task_photos_uploaded_by_fkey ON public.punchlist_task_photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_completed_by_fkey ON public.punchlist_tasks(completed_by);

-- Review related indexes
CREATE INDEX IF NOT EXISTS idx_review_requests_contact_id_fkey ON public.review_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_by_fkey ON public.review_requests(sent_by);

-- Security contract related indexes
CREATE INDEX IF NOT EXISTS idx_security_contract_approvals_contract_id_fkey ON public.security_contract_approvals(contract_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_cancellations_processed_by_fkey ON public.security_contract_cancellations(processed_by);
CREATE INDEX IF NOT EXISTS idx_security_contract_emergency_contacts_contract_id_fkey ON public.security_contract_emergency_contacts(contract_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_equipment_contract_id_fkey ON public.security_contract_equipment(contract_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_fields_template_id_fkey ON public.security_contract_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_security_contracts_contact_id_fkey ON public.security_contracts(contact_id);
CREATE INDEX IF NOT EXISTS idx_security_contracts_created_by_user_id_fkey ON public.security_contracts(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_security_contracts_template_id_fkey ON public.security_contracts(template_id);