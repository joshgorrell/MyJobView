/*
  # Add Missing Foreign Key Indexes - Batch 8 (Final)
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers subscription through work_orders tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
*/

-- Subscription Cancellations
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_cancelled_by_user_id ON public.subscription_cancellations(cancelled_by_user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_company_id ON public.subscription_cancellations(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_subscription_id ON public.subscription_cancellations(subscription_id);

-- Subscription Line Items
CREATE INDEX IF NOT EXISTS idx_subscription_line_items_product_id ON public.subscription_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_subscription_line_items_subscription_id ON public.subscription_line_items(subscription_id);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON public.tasks(claimed_by);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON public.tasks(contact_id);

-- Tax Exemption Certificates
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_company_id ON public.tax_exemption_certificates(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_contact_id ON public.tax_exemption_certificates(contact_id);

-- Tax Jurisdictions
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_company_id ON public.tax_jurisdictions(company_id);

-- Tech Locations
CREATE INDEX IF NOT EXISTS idx_tech_locations_technician_id ON public.tech_locations(technician_id);

-- Technician Locations
CREATE INDEX IF NOT EXISTS idx_technician_locations_technician_id ON public.technician_locations(technician_id);

-- Technician Skills
CREATE INDEX IF NOT EXISTS idx_technician_skills_skill_id ON public.technician_skills(skill_id);

-- Technician Status
CREATE INDEX IF NOT EXISTS idx_technician_status_current_appointment_id ON public.technician_status(current_appointment_id);

-- Time Entries
CREATE INDEX IF NOT EXISTS idx_time_entries_approved_by ON public.time_entries(approved_by);
CREATE INDEX IF NOT EXISTS idx_time_entries_technician_id ON public.time_entries(technician_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_work_order_id ON public.time_entries(work_order_id);

-- Travel Bonus Requests
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_approved_by ON public.travel_bonus_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_daily_clock_entry_id ON public.travel_bonus_requests(daily_clock_entry_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_office_id ON public.travel_bonus_requests(office_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_technician_id ON public.travel_bonus_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_travel_bonus_requests_work_order_id ON public.travel_bonus_requests(work_order_id);

-- Travel Logs
CREATE INDEX IF NOT EXISTS idx_travel_logs_appointment_id ON public.travel_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_travel_logs_approved_by ON public.travel_logs(approved_by);
CREATE INDEX IF NOT EXISTS idx_travel_logs_technician_id ON public.travel_logs(technician_id);

-- User Offices
CREATE INDEX IF NOT EXISTS idx_user_offices_office_id ON public.user_offices(office_id);

-- VIP Program Tracking
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_assigned_technician ON public.vip_program_tracking(assigned_technician);
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_contact_id ON public.vip_program_tracking(contact_id);
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_project_id ON public.vip_program_tracking(project_id);

-- Warehouses
CREATE INDEX IF NOT EXISTS idx_warehouses_manager_id ON public.warehouses(manager_id);

-- Work Order Materials
CREATE INDEX IF NOT EXISTS idx_work_order_materials_product_id ON public.work_order_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_work_order_materials_work_order_id ON public.work_order_materials(work_order_id);

-- Work Order Tasks
CREATE INDEX IF NOT EXISTS idx_work_order_tasks_assigned_to ON public.work_order_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_order_tasks_work_order_id ON public.work_order_tasks(work_order_id);

-- Work Orders
CREATE INDEX IF NOT EXISTS idx_work_orders_created_by ON public.work_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_merge_id ON public.work_orders(merge_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_parent_split_id ON public.work_orders(parent_split_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_project_id ON public.work_orders(project_id);