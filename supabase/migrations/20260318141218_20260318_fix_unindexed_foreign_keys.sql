/*
  # Fix Unindexed Foreign Keys

  ## Summary
  Creates indexes for 36 foreign key columns that lack covering indexes.
  Unindexed foreign keys cause slow JOIN and cascade operations.

  ## Tables Affected
  - change_orders, clock_in_rewards_log, clock_out_rewards_log
  - company_settings, contact_tags, customer_contact_log
  - customer_satisfaction, daily_clock_breaks, department_role_access
  - department_user_overrides, discussion_post_bumps, lead_messages
  - lead_tags, pipeline_stages, points_configuration
  - points_transactions, priority_levels, product_package_items
  - proposal_line_item_labor_phases, punchlist_access_grants
  - role_department_access, sales_orders, security_contract_emergency_contacts
  - service_requests, session_logout_schedule, skill_categories
  - skills, task_watchers, tax_jurisdictions
  - user_offices, user_points, work_orders
*/

CREATE INDEX IF NOT EXISTS idx_change_orders_transferred_to_proposal_id ON public.change_orders(transferred_to_proposal_id);

CREATE INDEX IF NOT EXISTS idx_clock_in_rewards_log_organization_id ON public.clock_in_rewards_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_clock_out_rewards_log_organization_id ON public.clock_out_rewards_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_company_settings_kiosk_office_id ON public.company_settings(kiosk_office_id);

CREATE INDEX IF NOT EXISTS idx_contact_tags_organization_id ON public.contact_tags(organization_id);

CREATE INDEX IF NOT EXISTS idx_customer_contact_log_logged_by ON public.customer_contact_log(logged_by);

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_created_by ON public.customer_satisfaction(created_by);

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_follow_up_cleared_by ON public.customer_satisfaction(follow_up_cleared_by);

CREATE INDEX IF NOT EXISTS idx_daily_clock_breaks_organization_id ON public.daily_clock_breaks(organization_id);

CREATE INDEX IF NOT EXISTS idx_department_role_access_organization_id ON public.department_role_access(organization_id);

CREATE INDEX IF NOT EXISTS idx_department_user_overrides_organization_id ON public.department_user_overrides(organization_id);

CREATE INDEX IF NOT EXISTS idx_discussion_post_bumps_organization_id ON public.discussion_post_bumps(organization_id);

CREATE INDEX IF NOT EXISTS idx_lead_messages_replied_to_message_id ON public.lead_messages(replied_to_message_id);

CREATE INDEX IF NOT EXISTS idx_lead_tags_organization_id ON public.lead_tags(organization_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_organization_id ON public.pipeline_stages(organization_id);

CREATE INDEX IF NOT EXISTS idx_points_configuration_company_id ON public.points_configuration(company_id);

CREATE INDEX IF NOT EXISTS idx_points_transactions_organization_id ON public.points_transactions(organization_id);

CREATE INDEX IF NOT EXISTS idx_priority_levels_organization_id ON public.priority_levels(organization_id);

CREATE INDEX IF NOT EXISTS idx_product_package_items_organization_id ON public.product_package_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_proposal_line_item_labor_phases_line_item_id ON public.proposal_line_item_labor_phases(line_item_id);

CREATE INDEX IF NOT EXISTS idx_proposal_line_item_labor_phases_organization_id ON public.proposal_line_item_labor_phases(organization_id);

CREATE INDEX IF NOT EXISTS idx_punchlist_access_grants_suspended_by ON public.punchlist_access_grants(suspended_by);

CREATE INDEX IF NOT EXISTS idx_role_department_access_department_id ON public.role_department_access(department_id);

CREATE INDEX IF NOT EXISTS idx_role_department_access_organization_id ON public.role_department_access(organization_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_project_id ON public.sales_orders(project_id);

CREATE INDEX IF NOT EXISTS idx_security_contract_emergency_contacts_organization_id ON public.security_contract_emergency_contacts(organization_id);

CREATE INDEX IF NOT EXISTS idx_service_requests_customer_contact_confirmed_by ON public.service_requests(customer_contact_confirmed_by);

CREATE INDEX IF NOT EXISTS idx_session_logout_schedule_updated_by ON public.session_logout_schedule(updated_by);

CREATE INDEX IF NOT EXISTS idx_skill_categories_organization_id ON public.skill_categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_skills_organization_id ON public.skills(organization_id);

CREATE INDEX IF NOT EXISTS idx_task_watchers_organization_id ON public.task_watchers(organization_id);

CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_organization_id ON public.tax_jurisdictions(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_offices_organization_id ON public.user_offices(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_points_organization_id ON public.user_points(organization_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_customer_contact_confirmed_by ON public.work_orders(customer_contact_confirmed_by);
