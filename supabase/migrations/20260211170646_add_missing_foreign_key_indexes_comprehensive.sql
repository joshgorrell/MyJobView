/*
  # Add Missing Foreign Key Indexes - Comprehensive Fix
  
  1. Performance Issue
    - 67 foreign key columns identified without indexes
    - This causes slow JOIN operations and full table scans
    - Can lead to lock contention and deadlocks on busy tables
  
  2. Changes
    - Add indexes on all unindexed foreign key columns
    - Most are organization_id columns used for multi-tenancy filtering
    - Others are user references and inter-table relationships
    - Dramatically improves JOIN and WHERE clause performance
  
  3. Tables Covered
    - All tables with missing foreign key indexes
    - Focus on frequently queried tables first
  
  4. Note
    - Indexes created without CONCURRENTLY to work within transaction
    - May briefly lock tables during index creation
*/

-- Organization ID indexes (multi-tenancy filtering)
CREATE INDEX IF NOT EXISTS idx_bug_reports_organization_id ON bug_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendars_organization_id ON calendars(organization_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_organization_id ON change_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_company_commission_settings_organization_id ON company_commission_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_competitors_organization_id ON competitors(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_organization_id ON crew_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_device_nicknames_organization_id ON device_nicknames(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_workflows_organization_id ON email_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_organization_id ON file_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_change_order_links_organization_id ON invoice_change_order_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_ip_nicknames_organization_id ON ip_nicknames(organization_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_organization_id ON issue_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_labor_phases_organization_id ON labor_phases(organization_id);
CREATE INDEX IF NOT EXISTS idx_manufacturers_organization_id ON manufacturers(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_organization_id ON message_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_services_organization_id ON monitoring_services(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_pending_punchlist_invites_organization_id ON pending_punchlist_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_points_configuration_organization_id ON points_configuration(organization_id);
CREATE INDEX IF NOT EXISTS idx_priority_levels_organization_id ON priority_levels(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_organization_id ON product_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_classes_organization_id ON product_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_packages_organization_id ON product_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_request_settings_organization_id ON product_request_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_organization_id ON product_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_area_templates_organization_id ON proposal_area_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_organization_id ON proposal_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_report_templates_organization_id ON proposal_report_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_settings_organization_id ON proposal_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_pto_policies_organization_id ON pto_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_organization_id ON pto_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_punch_lists_organization_id ON punch_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_organization_id ON push_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_organization_id ON recurring_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_organization_id ON recurring_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_organization_id ON recurring_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_organization_id ON review_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_organization_id ON rewards_catalog(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_organization_id ON scheduled_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_contract_templates_organization_id ON security_contract_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_organization_id ON signup_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_skill_categories_organization_id ON skill_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_skills_organization_id ON skills(organization_id);
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

-- Other foreign key indexes
CREATE INDEX IF NOT EXISTS idx_commission_payment_batches_processed_by ON commission_payment_batches(processed_by);
CREATE INDEX IF NOT EXISTS idx_commission_statements_generated_by ON commission_statements(generated_by);
CREATE INDEX IF NOT EXISTS idx_discount_code_redemptions_tenant_subscription_id ON discount_code_redemptions(tenant_subscription_id);
CREATE INDEX IF NOT EXISTS idx_platform_pricing_history_pricing_id ON platform_pricing_history(pricing_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_auto_completed_by ON project_tasks(auto_completed_by) WHERE auto_completed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_archived_by ON proposals(archived_by) WHERE archived_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_lead_technician_id ON sales_orders(lead_technician_id) WHERE lead_technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_discount_code_id ON tenant_subscriptions(discount_code_id) WHERE discount_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_tune_bonus_history_changed_by ON test_tune_bonus_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_time_entry_import_history_profile_id ON time_entry_import_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_import_history_rollback_by ON time_entry_import_history(rollback_by) WHERE rollback_by IS NOT NULL;