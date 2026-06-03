/*
  # Fix Missing Organization ID Indexes - Batch 3
  
  1. Performance Optimization
    - Add indexes to organization_id columns across all tables
    - Critical for multi-tenant data isolation and query performance
    
  2. Tables Covered (Batch 3 of 4)
    - pto_policies, pto_requests, punch_lists, push_subscriptions
    - recurring_invoices, recurring_plans, recurring_subscriptions
    - review_requests, rewards_catalog, sales_orders
    - scheduled_connections, security_contract_templates, service_requests
    - signup_attempts, skill_categories, skills
*/

CREATE INDEX IF NOT EXISTS idx_pto_policies_organization_id ON pto_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_organization_id ON pto_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_punch_lists_organization_id ON punch_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_organization_id ON push_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_organization_id ON recurring_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_organization_id ON recurring_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_organization_id ON recurring_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_organization_id ON review_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_organization_id ON rewards_catalog(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_organization_id ON sales_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_organization_id ON scheduled_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_templates_organization_id ON security_contract_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_organization_id ON service_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_organization_id ON signup_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_skill_categories_organization_id ON skill_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_skills_organization_id ON skills(organization_id);