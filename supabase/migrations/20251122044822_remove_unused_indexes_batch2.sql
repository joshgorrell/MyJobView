/*
  # Remove Unused Indexes - Batch 2

  1. Purpose
    - Continue removing unused indexes
    - Focus on job/work order and inventory related tables
*/

-- Proposals and related
DROP INDEX IF EXISTS idx_proposals_office_id;
DROP INDEX IF EXISTS idx_proposals_company;
DROP INDEX IF EXISTS idx_proposals_contact;
DROP INDEX IF EXISTS idx_proposals_lead_id;
DROP INDEX IF EXISTS idx_proposals_expiration;
DROP INDEX IF EXISTS idx_proposal_line_items_proposal;
DROP INDEX IF EXISTS idx_proposal_line_items_room;
DROP INDEX IF EXISTS idx_proposal_line_items_sort;
DROP INDEX IF EXISTS idx_proposal_rooms_proposal;
DROP INDEX IF EXISTS idx_proposal_rooms_sort;
DROP INDEX IF EXISTS idx_proposal_versions_proposal;
DROP INDEX IF EXISTS idx_proposal_versions_created;

-- Projects
DROP INDEX IF EXISTS idx_projects_office_id;
DROP INDEX IF EXISTS idx_projects_created_by;
DROP INDEX IF EXISTS idx_projects_company;
DROP INDEX IF EXISTS idx_projects_contact;
DROP INDEX IF EXISTS idx_projects_status;
DROP INDEX IF EXISTS idx_projects_sales_order;
DROP INDEX IF EXISTS idx_projects_pm;

-- Invoices
DROP INDEX IF EXISTS idx_invoices_office_id;
DROP INDEX IF EXISTS idx_invoices_created_by;
DROP INDEX IF EXISTS idx_invoices_company;
DROP INDEX IF EXISTS idx_invoices_qbo;
DROP INDEX IF EXISTS idx_invoices_project;
DROP INDEX IF EXISTS idx_invoices_contact;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoice_line_items_invoice;

-- Payments
DROP INDEX IF EXISTS idx_payments_company;
DROP INDEX IF EXISTS idx_payments_invoice;
DROP INDEX IF EXISTS idx_payments_contact;
DROP INDEX IF EXISTS idx_payments_qbo;
DROP INDEX IF EXISTS idx_payments_created_by;

-- Appointments
DROP INDEX IF EXISTS idx_appointments_company;
DROP INDEX IF EXISTS idx_appointments_project;
DROP INDEX IF EXISTS idx_appointments_contact;
DROP INDEX IF EXISTS idx_appointments_start;
DROP INDEX IF EXISTS idx_appointments_status;
DROP INDEX IF EXISTS idx_appointments_technician;
DROP INDEX IF EXISTS idx_appointments_created_by;

-- Commissions
DROP INDEX IF EXISTS idx_commission_records_company;
DROP INDEX IF EXISTS idx_commission_records_source;
DROP INDEX IF EXISTS idx_commission_records_status;
DROP INDEX IF EXISTS idx_commission_records_project;
DROP INDEX IF EXISTS idx_commission_adjustments_adjusted_by;
DROP INDEX IF EXISTS idx_commission_adjustments_commission_record_id;
DROP INDEX IF EXISTS idx_commission_payments_commission_record_id;
DROP INDEX IF EXISTS idx_commission_payments_date;
DROP INDEX IF EXISTS idx_commission_payments_processed_by;
DROP INDEX IF EXISTS idx_project_commission_overrides_created_by;

-- Messages
DROP INDEX IF EXISTS idx_message_threads_company;
DROP INDEX IF EXISTS idx_message_threads_project;
DROP INDEX IF EXISTS idx_message_threads_contact;
DROP INDEX IF EXISTS idx_message_threads_created_by;
DROP INDEX IF EXISTS idx_message_threads_context;
DROP INDEX IF EXISTS idx_message_threads_last_message;
DROP INDEX IF EXISTS idx_messages_thread;
DROP INDEX IF EXISTS idx_messages_created;
DROP INDEX IF EXISTS idx_messages_author;

-- File attachments
DROP INDEX IF EXISTS idx_file_attachments_company;
DROP INDEX IF EXISTS idx_file_attachments_context;
DROP INDEX IF EXISTS idx_file_attachments_message;
DROP INDEX IF EXISTS idx_file_attachments_uploader;

-- Service requests
DROP INDEX IF EXISTS idx_service_requests_contact;
DROP INDEX IF EXISTS idx_service_requests_created_by;
DROP INDEX IF EXISTS idx_service_requests_work_order;
DROP INDEX IF EXISTS idx_service_requests_created_at;

-- Service billing
DROP INDEX IF EXISTS idx_service_billing_queue_work_order;
DROP INDEX IF EXISTS idx_service_billing_queue_assigned_to;
DROP INDEX IF EXISTS idx_service_billing_queue_status;
DROP INDEX IF EXISTS idx_service_billing_queue_invoice;
DROP INDEX IF EXISTS idx_service_billing_queue_deadline;
DROP INDEX IF EXISTS idx_service_billing_queue_contact_id;
DROP INDEX IF EXISTS idx_service_billing_queue_service_request_id;

-- Service labor/parts/charges
DROP INDEX IF EXISTS idx_service_labor_work_order;
DROP INDEX IF EXISTS idx_service_labor_tech;
DROP INDEX IF EXISTS idx_service_labor_billing_queue;
DROP INDEX IF EXISTS idx_service_labor_entries_overridden_by;
DROP INDEX IF EXISTS idx_service_parts_work_order;
DROP INDEX IF EXISTS idx_service_parts_product;
DROP INDEX IF EXISTS idx_service_parts_billing_queue;
DROP INDEX IF EXISTS idx_service_parts_used_overridden_by;
DROP INDEX IF EXISTS idx_service_charges_billing_queue;
DROP INDEX IF EXISTS idx_service_additional_charges_added_by;

-- Email templates
DROP INDEX IF EXISTS idx_email_templates_active;

-- Connections
DROP INDEX IF EXISTS idx_connections_user_id;
DROP INDEX IF EXISTS idx_connections_contact_id;
DROP INDEX IF EXISTS idx_connections_reminder;
DROP INDEX IF EXISTS idx_connections_lead_id;

-- Lead messages
DROP INDEX IF EXISTS idx_lead_messages_email_message_id;
DROP INDEX IF EXISTS idx_lead_messages_replied_to_message_id;
DROP INDEX IF EXISTS idx_lead_messages_user_id;

COMMENT ON TABLE proposals IS 'Cleaned up unused proposal tracking indexes';
COMMENT ON TABLE projects IS 'Cleaned up unused project tracking indexes';
COMMENT ON TABLE service_requests IS 'Cleaned up unused service request indexes';
