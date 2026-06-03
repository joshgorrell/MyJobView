/*
  # Drop Unused Indexes - Batch 3 (Organization IDs and Misc)

  1. Performance Improvements
    - Remove organization_id indexes that are not being used
    - Remove miscellaneous unused indexes

  2. Focus
    - Many tables have unused organization_id indexes
    - Various supporting tables with unused indexes
*/

-- Drop unused organization_id indexes from various tables
DROP INDEX IF EXISTS public.idx_bug_reports_organization_id;
DROP INDEX IF EXISTS public.idx_calendars_organization_id;
DROP INDEX IF EXISTS public.idx_change_orders_organization_id;
DROP INDEX IF EXISTS public.idx_company_commission_settings_organization_id;
DROP INDEX IF EXISTS public.idx_contracts_organization_id;
DROP INDEX IF EXISTS public.idx_crew_assignments_organization_id;
DROP INDEX IF EXISTS public.idx_device_nicknames_organization_id;
DROP INDEX IF EXISTS public.idx_email_workflows_organization_id;
DROP INDEX IF EXISTS public.idx_file_attachments_organization_id;
DROP INDEX IF EXISTS public.idx_ip_nicknames_organization_id;
DROP INDEX IF EXISTS public.idx_issue_reports_organization_id;
DROP INDEX IF EXISTS public.idx_labor_phases_organization_id;
DROP INDEX IF EXISTS public.idx_message_threads_organization_id;
DROP INDEX IF EXISTS public.idx_payments_organization_id;
DROP INDEX IF EXISTS public.idx_pending_punchlist_invites_organization_id;
DROP INDEX IF EXISTS public.idx_points_configuration_organization_id;
DROP INDEX IF EXISTS public.idx_priority_levels_organization_id;
DROP INDEX IF EXISTS public.idx_product_categories_organization_id;
DROP INDEX IF EXISTS public.idx_product_classes_organization_id;
DROP INDEX IF EXISTS public.idx_product_packages_organization_id;
DROP INDEX IF EXISTS public.idx_product_request_settings_organization_id;
DROP INDEX IF EXISTS public.idx_product_requests_organization_id;
DROP INDEX IF EXISTS public.idx_proposal_notifications_organization_id;
DROP INDEX IF EXISTS public.idx_proposal_report_templates_organization_id;
DROP INDEX IF EXISTS public.idx_proposal_settings_organization_id;
DROP INDEX IF EXISTS public.idx_pto_policies_organization_id;
DROP INDEX IF EXISTS public.idx_pto_requests_organization_id;
DROP INDEX IF EXISTS public.idx_punch_lists_organization_id;
DROP INDEX IF EXISTS public.idx_push_subscriptions_organization_id;
DROP INDEX IF EXISTS public.idx_recurring_invoices_organization_id;
DROP INDEX IF EXISTS public.idx_recurring_plans_organization_id;
DROP INDEX IF EXISTS public.idx_recurring_subscriptions_organization_id;
DROP INDEX IF EXISTS public.idx_review_requests_organization_id;
DROP INDEX IF EXISTS public.idx_rewards_catalog_organization_id;
DROP INDEX IF EXISTS public.idx_scheduled_connections_organization_id;
DROP INDEX IF EXISTS public.idx_security_contract_templates_organization_id;
DROP INDEX IF EXISTS public.idx_signup_attempts_organization_id;
DROP INDEX IF EXISTS public.idx_skill_categories_organization_id;
DROP INDEX IF EXISTS public.idx_skills_organization_id;
DROP INDEX IF EXISTS public.idx_sticky_notes_organization_id;
DROP INDEX IF EXISTS public.idx_subscription_cancellations_organization_id;
DROP INDEX IF EXISTS public.idx_tax_exemption_certificates_organization_id;
DROP INDEX IF EXISTS public.idx_tax_jurisdictions_organization_id;
DROP INDEX IF EXISTS public.idx_technician_skills_organization_id;
DROP INDEX IF EXISTS public.idx_time_adjustment_requests_organization_id;
DROP INDEX IF EXISTS public.idx_travel_logs_organization_id;
DROP INDEX IF EXISTS public.idx_user_sessions_organization_id;
DROP INDEX IF EXISTS public.idx_vendors_organization_id;
DROP INDEX IF EXISTS public.idx_vip_program_tracking_organization_id;
DROP INDEX IF EXISTS public.idx_warehouses_organization_id;

-- Drop other unused indexes
DROP INDEX IF EXISTS public.idx_daily_clock_entries_office_id;
DROP INDEX IF EXISTS public.idx_daily_clock_entries_home_clock;
DROP INDEX IF EXISTS public.idx_daily_clock_entries_reviewed_by;
DROP INDEX IF EXISTS public.idx_daily_clock_entries_admin_reviewed_by;
DROP INDEX IF EXISTS public.idx_daily_clock_entries_gps_refined;
DROP INDEX IF EXISTS public.idx_daily_clock_entries_gps_quality;
DROP INDEX IF EXISTS public.idx_clock_entries_gps_reporting;
DROP INDEX IF EXISTS public.idx_clock_entries_missing_gps;
DROP INDEX IF EXISTS public.idx_clock_entries_gps_accuracy;
DROP INDEX IF EXISTS public.idx_daily_clock_clock_in_location;
DROP INDEX IF EXISTS public.idx_daily_clock_clock_out_location;
DROP INDEX IF EXISTS public.idx_daily_clock_home_flags;
DROP INDEX IF EXISTS public.idx_daily_clock_offline_unreviewed;

-- Drop unused profile indexes
DROP INDEX IF EXISTS public.idx_profiles_contact_id;
DROP INDEX IF EXISTS public.idx_profiles_primary_office_id;
DROP INDEX IF EXISTS public.idx_profiles_role_id;
DROP INDEX IF EXISTS public.idx_profiles_home_location;
DROP INDEX IF EXISTS public.idx_profiles_service_manager_role;
DROP INDEX IF EXISTS public.idx_profiles_calendar_access;
DROP INDEX IF EXISTS public.idx_profiles_discussion_visibility;
DROP INDEX IF EXISTS public.idx_profiles_first_name;
DROP INDEX IF EXISTS public.idx_profiles_last_name;
DROP INDEX IF EXISTS public.idx_profiles_can_view_prospects;
DROP INDEX IF EXISTS public.idx_profiles_pipeline_widgets;
DROP INDEX IF EXISTS public.idx_profiles_organization_id;

-- Drop unused project and sales order indexes
DROP INDEX IF EXISTS public.idx_projects_office_id;
DROP INDEX IF EXISTS public.idx_projects_sales_order_id;
DROP INDEX IF EXISTS public.idx_projects_orphaned;
DROP INDEX IF EXISTS public.idx_projects_organization_id;
DROP INDEX IF EXISTS public.idx_sales_orders_lead_technician_id;
DROP INDEX IF EXISTS public.idx_sales_orders_organization_id;

-- Drop unused service request indexes
DROP INDEX IF EXISTS public.idx_service_requests_contact_id;
DROP INDEX IF EXISTS public.idx_service_requests_created_by;
DROP INDEX IF EXISTS public.idx_service_requests_work_order_id;
DROP INDEX IF EXISTS public.idx_service_requests_source_type;
DROP INDEX IF EXISTS public.idx_service_requests_organization_id;
