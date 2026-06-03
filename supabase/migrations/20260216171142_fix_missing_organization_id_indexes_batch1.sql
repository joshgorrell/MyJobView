/*
  # Fix Missing Organization ID Indexes - Batch 1
  
  1. Performance Optimization
    - Add indexes to organization_id columns across all tables
    - Critical for multi-tenant data isolation and query performance
    - Most RLS policies filter by organization_id
    
  2. Tables Covered (Batch 1 of 4)
    - appointments, bug_reports, calendars, change_orders
    - company_commission_settings, contacts, contracts, crew_assignments
    - device_nicknames, email_workflows, file_attachments, invoices
    - ip_nicknames, issue_reports, job_photos, labor_phases
*/

CREATE INDEX IF NOT EXISTS idx_appointments_organization_id ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_organization_id ON bug_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendars_organization_id ON calendars(organization_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_organization_id ON change_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_company_commission_settings_organization_id ON company_commission_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_organization_id ON crew_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_device_nicknames_organization_id ON device_nicknames(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_workflows_organization_id ON email_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_organization_id ON file_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_ip_nicknames_organization_id ON ip_nicknames(organization_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_organization_id ON issue_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_organization_id ON job_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_labor_phases_organization_id ON labor_phases(organization_id);