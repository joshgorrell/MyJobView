/*
  # Fix Missing Non-Organization Indexes
  
  1. Performance Optimization
    - Add indexes to other foreign key columns that are missing indexes
    - Improves query performance for specific relationships
    
  2. Tables and Columns Covered
    - contacts (office_id)
    - profiles (contact_id, primary_office_id, role_id)
    - proposals (deposit_invoice_id, lead_id, report_template_id, sales_order_id)
    - service_requests (contact_id, created_by, work_order_id)
    - job_photos (contact_id, project_id, work_order_id, technician_id, paparazzi_request_id)
    - daily_clock_entries (reviewed_by, admin_reviewed_by, office_id)
    - time_entries (import_batch_id)
    - work_orders (appointment_id, labor_category_id, merge_id, parent_split_id, recurring_subscription_id, warranty_reference_id)
*/

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_office_id ON contacts(office_id);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_contact_id ON profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_profiles_primary_office_id ON profiles(primary_office_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Proposals
CREATE INDEX IF NOT EXISTS idx_proposals_deposit_invoice_id ON proposals(deposit_invoice_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_report_template_id ON proposals(report_template_id);
CREATE INDEX IF NOT EXISTS idx_proposals_sales_order_id ON proposals(sales_order_id);

-- Service requests
CREATE INDEX IF NOT EXISTS idx_service_requests_contact_id ON service_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_by ON service_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_service_requests_work_order_id ON service_requests(work_order_id);

-- Job photos
CREATE INDEX IF NOT EXISTS idx_job_photos_contact_id ON job_photos(contact_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_project_id ON job_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_work_order_id ON job_photos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_technician_id ON job_photos(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_paparazzi_request_id ON job_photos(paparazzi_request_id);

-- Daily clock entries
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_reviewed_by ON daily_clock_entries(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_admin_reviewed_by ON daily_clock_entries(admin_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_office_id ON daily_clock_entries(office_id);

-- Time entries
CREATE INDEX IF NOT EXISTS idx_time_entries_import_batch_id ON time_entries(import_batch_id);

-- Work orders
CREATE INDEX IF NOT EXISTS idx_work_orders_appointment_id ON work_orders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_labor_category_id ON work_orders(labor_category_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_merge_id ON work_orders(merge_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_parent_split_id ON work_orders(parent_split_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_recurring_subscription_id ON work_orders(recurring_subscription_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_warranty_reference_id ON work_orders(warranty_reference_id);