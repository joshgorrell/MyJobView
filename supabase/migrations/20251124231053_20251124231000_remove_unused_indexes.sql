/*
  # Remove Unused Indexes
  
  Removes indexes that have not been used to improve write performance
  and reduce storage overhead.
  
  ## Changes
  - Drops unused indexes identified by Supabase security advisor
  - Keeps indexes that may be needed for future queries
*/

-- Proposals
DROP INDEX IF EXISTS public.idx_proposals_office_id;

-- Recurring Plans  
DROP INDEX IF EXISTS public.idx_recurring_plans_plan_type;

-- Work Orders
DROP INDEX IF EXISTS public.idx_work_orders_contact;
DROP INDEX IF EXISTS public.idx_work_orders_group;

-- Proposal Area Templates
DROP INDEX IF EXISTS public.idx_proposal_area_templates_company_id;

-- Proposal Settings
DROP INDEX IF EXISTS public.idx_proposal_settings_contract_id;

-- Review Requests
DROP INDEX IF EXISTS public.idx_review_requests_contact;
DROP INDEX IF EXISTS public.idx_review_requests_sent_by;

-- Clock Out Rewards
DROP INDEX IF EXISTS public.idx_clock_out_rewards_tech;
DROP INDEX IF EXISTS public.idx_clock_out_rewards_type;
DROP INDEX IF EXISTS public.idx_clock_out_rewards_related;

-- Jobs schema indexes (if they exist)
DROP INDEX IF EXISTS jobs.idx_projects_company;
DROP INDEX IF EXISTS jobs.idx_projects_contact;
DROP INDEX IF EXISTS jobs.idx_projects_status;
DROP INDEX IF EXISTS jobs.idx_invoices_company;
DROP INDEX IF EXISTS jobs.idx_invoices_contact;
DROP INDEX IF EXISTS jobs.idx_invoices_project;
DROP INDEX IF EXISTS jobs.idx_invoices_status;
DROP INDEX IF EXISTS jobs.idx_payments_company;
DROP INDEX IF EXISTS jobs.idx_payments_invoice;
DROP INDEX IF EXISTS jobs.idx_payments_contact;
DROP INDEX IF EXISTS jobs.idx_appointments_company;
DROP INDEX IF EXISTS jobs.idx_appointments_project;
DROP INDEX IF EXISTS jobs.idx_appointments_contact;
DROP INDEX IF EXISTS jobs.idx_appointments_start;
DROP INDEX IF EXISTS jobs.idx_commission_records_company;
DROP INDEX IF EXISTS jobs.idx_commission_records_source;
DROP INDEX IF EXISTS jobs.idx_commission_records_status;
DROP INDEX IF EXISTS jobs.idx_message_threads_company;
DROP INDEX IF EXISTS jobs.idx_message_threads_project;
DROP INDEX IF EXISTS jobs.idx_message_threads_contact;
DROP INDEX IF EXISTS jobs.idx_messages_thread;
DROP INDEX IF EXISTS jobs.idx_messages_created;
DROP INDEX IF EXISTS jobs.idx_appointments_created_by;
DROP INDEX IF EXISTS jobs.idx_message_threads_created_by;
DROP INDEX IF EXISTS jobs.idx_payments_created_by;
DROP INDEX IF EXISTS jobs.idx_projects_office_id;
DROP INDEX IF EXISTS jobs.idx_projects_proposal_id;

-- Service Requests
DROP INDEX IF EXISTS public.idx_service_requests_billable_by_user;

-- Security Contracts
DROP INDEX IF EXISTS public.idx_security_contract_fields_template;
DROP INDEX IF EXISTS public.idx_security_contracts_template;
DROP INDEX IF EXISTS public.idx_security_contracts_contact;
DROP INDEX IF EXISTS public.idx_security_contracts_created_by;
DROP INDEX IF EXISTS public.idx_security_contracts_magic_link;
DROP INDEX IF EXISTS public.idx_security_contract_responses_contract;
DROP INDEX IF EXISTS public.idx_security_contract_equipment_contract;
DROP INDEX IF EXISTS public.idx_security_contract_emergency_contacts_contract;
DROP INDEX IF EXISTS public.idx_security_contract_approvals_contract;
DROP INDEX IF EXISTS public.idx_security_contract_approvals_status;

-- Serial Tracking
DROP INDEX IF EXISTS public.idx_serial_tracking_bin_id;
DROP INDEX IF EXISTS public.idx_serial_tracking_reserved_proposal;

-- Stock Reservations
DROP INDEX IF EXISTS public.idx_stock_reservations_line_item;
DROP INDEX IF EXISTS public.idx_stock_reservations_reserved_by;

-- Tax
DROP INDEX IF EXISTS public.idx_tax_exemption_verified_by;
DROP INDEX IF EXISTS public.idx_invoices_tax_jurisdiction_id;
DROP INDEX IF EXISTS public.idx_proposals_tax_jurisdiction_id;

-- Punchlist
DROP INDEX IF EXISTS public.idx_pending_invites_reviewed_by;
DROP INDEX IF EXISTS public.idx_punchlist_photos_uploaded_by;
DROP INDEX IF EXISTS public.idx_punchlist_tasks_completed_by;

-- User Permissions
DROP INDEX IF EXISTS public.idx_user_permission_created_by;