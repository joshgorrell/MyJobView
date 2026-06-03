/*
  # Fix Missing Organization ID Indexes - Batch 4
  
  1. Performance Optimization
    - Add indexes to organization_id columns across all tables
    - Critical for multi-tenant data isolation and query performance
    
  2. Tables Covered (Batch 4 of 4)
    - sticky_notes, subscription_cancellations, tax_exemption_certificates
    - tax_jurisdictions, technician_skills, time_adjustment_requests
    - time_entries, travel_logs, user_sessions
    - vendors, vip_program_tracking, warehouses, work_orders
*/

CREATE INDEX IF NOT EXISTS idx_sticky_notes_organization_id ON sticky_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_organization_id ON subscription_cancellations(organization_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_certificates_organization_id ON tax_exemption_certificates(organization_id);
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_organization_id ON tax_jurisdictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_technician_skills_organization_id ON technician_skills(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_organization_id ON time_adjustment_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_organization_id ON time_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_travel_logs_organization_id ON travel_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_organization_id ON user_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_organization_id ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vip_program_tracking_organization_id ON vip_program_tracking(organization_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_organization_id ON warehouses(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_organization_id ON work_orders(organization_id);