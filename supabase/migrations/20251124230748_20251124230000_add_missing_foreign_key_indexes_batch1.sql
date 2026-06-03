/*
  # Add Missing Foreign Key Indexes - Batch 1
  
  Adds indexes for foreign key columns to improve query performance.
  This batch covers appointments through crew_assignments tables.
  
  ## Changes
  - Adds indexes on foreign key columns that were missing covering indexes
  - Improves JOIN performance and constraint checking speed
*/

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON public.appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_project_id ON public.appointments(project_id);
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_parent_id ON public.appointments(recurrence_parent_id);

-- Change Orders
CREATE INDEX IF NOT EXISTS idx_change_orders_approved_by ON public.change_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_change_orders_project_id ON public.change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_requested_by ON public.change_orders(requested_by);

-- Clock In Rewards Log
CREATE INDEX IF NOT EXISTS idx_clock_in_rewards_log_technician_id ON public.clock_in_rewards_log(technician_id);

-- Commission Adjustments
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_adjusted_by ON public.commission_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_commission_record_id ON public.commission_adjustments(commission_record_id);

-- Commission Payments
CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_record_id ON public.commission_payments(commission_record_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_processed_by ON public.commission_payments(processed_by);

-- Connections
CREATE INDEX IF NOT EXISTS idx_connections_contact_id ON public.connections(contact_id);
CREATE INDEX IF NOT EXISTS idx_connections_lead_id ON public.connections(lead_id);
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON public.connections(user_id);

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON public.contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_office_id ON public.contacts(office_id);
CREATE INDEX IF NOT EXISTS idx_contacts_portal_user_id ON public.contacts(portal_user_id);

-- Control4 Projects
CREATE INDEX IF NOT EXISTS idx_control4_projects_project_id ON public.control4_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_control4_projects_proposal_id ON public.control4_projects(proposal_id);

-- Crew Assignments
CREATE INDEX IF NOT EXISTS idx_crew_assignments_created_by ON public.crew_assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_lead_technician_id ON public.crew_assignments(lead_technician_id);