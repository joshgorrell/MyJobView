/*
  # Fix Missing Organization ID Indexes - Batch 2
  
  1. Performance Optimization
    - Add indexes to organization_id columns across all tables
    - Critical for multi-tenant data isolation and query performance
    
  2. Tables Covered (Batch 2 of 4)
    - message_threads, payments, pending_punchlist_invites
    - points_configuration, priority_levels, product_categories
    - product_classes, product_packages, product_request_settings
    - product_requests, profiles, projects
    - proposal_notifications, proposal_report_templates, proposal_settings, proposals
*/

CREATE INDEX IF NOT EXISTS idx_message_threads_organization_id ON message_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_pending_punchlist_invites_organization_id ON pending_punchlist_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_points_configuration_organization_id ON points_configuration(organization_id);
CREATE INDEX IF NOT EXISTS idx_priority_levels_organization_id ON priority_levels(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_organization_id ON product_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_classes_organization_id ON product_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_organization_id ON product_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_request_settings_organization_id ON product_request_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_organization_id ON product_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_organization_id ON proposal_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_report_templates_organization_id ON proposal_report_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_settings_organization_id ON proposal_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposals_organization_id ON proposals(organization_id);