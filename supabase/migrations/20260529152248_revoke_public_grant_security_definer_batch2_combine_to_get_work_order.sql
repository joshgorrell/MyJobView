/*
  # Revoke PUBLIC execute grant on SECURITY DEFINER functions — Batch 2 (combine → get_work_order_group_summary)

  Revoke from PUBLIC then re-grant to authenticated only.
*/

-- combine_service_requests_to_work_order
REVOKE EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) TO authenticated;

-- contact_has_active_vip_subscription (also needs authenticated grant since it was anon-revoked above)
REVOKE EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(uuid) TO authenticated;

-- contact_has_punchlist_access
REVOKE EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) TO authenticated;

-- convert_lead_to_prospect
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid, uuid, text, text, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid, uuid, text, text, timestamptz, text, text) TO authenticated;

-- convert_prospect_to_customer
REVOKE EXECUTE ON FUNCTION public.convert_prospect_to_customer(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_customer(uuid, uuid, text) TO authenticated;

-- convert_punchlist_tasks_to_service_request (3 overloads)
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, uuid, text, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], text, text, date) TO authenticated;

-- convert_punchlist_tasks_to_work_order (2 overloads)
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamptz, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamptz, numeric, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time, text) TO authenticated;

-- create_deposit_invoice_from_proposal (2 overloads)
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid, text) TO authenticated;

-- create_manual_punchlist_invite
REVOKE EXECUTE ON FUNCTION public.create_manual_punchlist_invite(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_punchlist_invite(uuid, text) TO authenticated;

-- create_next_mileage_reminder
REVOKE EXECUTE ON FUNCTION public.create_next_mileage_reminder(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_next_mileage_reminder(uuid, uuid) TO authenticated;

-- create_promotional_access_grant
REVOKE EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) TO authenticated;

-- create_proposal_revision
REVOKE EXECUTE ON FUNCTION public.create_proposal_revision(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proposal_revision(uuid, text, uuid) TO authenticated;

-- create_proposal_version
REVOKE EXECUTE ON FUNCTION public.create_proposal_version(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proposal_version(uuid, uuid, text) TO authenticated;

-- current_user_id
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;

-- decline_punchlist_invite
REVOKE EXECUTE ON FUNCTION public.decline_punchlist_invite(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_punchlist_invite(uuid, text) TO authenticated;

-- duplicate_work_order_to_technician
REVOKE EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid, uuid, uuid) TO authenticated;

-- end_user_session
REVOKE EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) TO authenticated;

-- enroll_in_workflow
REVOKE EXECUTE ON FUNCTION public.enroll_in_workflow(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_in_workflow(uuid, uuid, uuid, jsonb) TO authenticated;

-- generate_combined_task_description
REVOKE EXECUTE ON FUNCTION public.generate_combined_task_description(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_combined_task_description(uuid[]) TO authenticated;

-- generate_project_number
REVOKE EXECUTE ON FUNCTION public.generate_project_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_project_number(text) TO authenticated;

-- generate_recurring_appointments
REVOKE EXECUTE ON FUNCTION public.generate_recurring_appointments(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_recurring_appointments(uuid, date) TO authenticated;

-- generate_recurring_work_orders
REVOKE EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid, date) TO authenticated;

-- generate_sales_order_number
REVOKE EXECUTE ON FUNCTION public.generate_sales_order_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_sales_order_number(text) TO authenticated;

-- get_active_sessions_with_cleanup
REVOKE EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() TO authenticated;

-- get_all_punchlist_customers
REVOKE EXECUTE ON FUNCTION public.get_all_punchlist_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_punchlist_customers() TO authenticated;

-- get_applicable_tax_rate (also needs authenticated re-grant after anon revoke)
REVOKE EXECUTE ON FUNCTION public.get_applicable_tax_rate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_applicable_tax_rate(uuid, text) TO authenticated;

-- get_appointments_with_privacy
REVOKE EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid, uuid, date, date) TO authenticated;

-- get_billing_summary
REVOKE EXECUTE ON FUNCTION public.get_billing_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_summary(uuid) TO authenticated;

-- get_contact_portal_access_level (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.get_contact_portal_access_level(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact_portal_access_level(uuid) TO authenticated;

-- get_effective_commission_rate
REVOKE EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid, text) TO authenticated;

-- get_gps_quality_report
REVOKE EXECUTE ON FUNCTION public.get_gps_quality_report(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gps_quality_report(uuid, date, date) TO authenticated;

-- get_latest_technician_locations
REVOKE EXECUTE ON FUNCTION public.get_latest_technician_locations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_technician_locations() TO authenticated;

-- get_proposal_activity_summary
REVOKE EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) TO authenticated;

-- get_proposal_payment_methods (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.get_proposal_payment_methods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_payment_methods(uuid) TO authenticated;

-- get_proposal_sales_order_id
REVOKE EXECUTE ON FUNCTION public.get_proposal_sales_order_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_sales_order_id(uuid) TO authenticated;

-- get_proposal_unread_count
REVOKE EXECUTE ON FUNCTION public.get_proposal_unread_count(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_unread_count(uuid, text) TO authenticated;

-- get_punchlist_access_info (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;

-- get_recent_auto_clock_outs
REVOKE EXECUTE ON FUNCTION public.get_recent_auto_clock_outs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_auto_clock_outs(integer) TO authenticated;

-- get_recently_used_products
REVOKE EXECUTE ON FUNCTION public.get_recently_used_products(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recently_used_products(uuid, integer) TO authenticated;

-- get_root_proposal_id
REVOKE EXECUTE ON FUNCTION public.get_root_proposal_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_root_proposal_id(uuid) TO authenticated;

-- get_session_logout_schedule
REVOKE EXECUTE ON FUNCTION public.get_session_logout_schedule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_logout_schedule() TO authenticated;

-- get_tech_efficiency_for_advisor
REVOKE EXECUTE ON FUNCTION public.get_tech_efficiency_for_advisor(date, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tech_efficiency_for_advisor(date, date, date, date) TO authenticated;

-- get_technician_route
REVOKE EXECUTE ON FUNCTION public.get_technician_route(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_technician_route(uuid) TO authenticated;

-- get_test_tune_labor_totals
REVOKE EXECUTE ON FUNCTION public.get_test_tune_labor_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_labor_totals(uuid) TO authenticated;

-- get_test_tune_project_detail
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_project_detail(uuid) TO authenticated;

-- get_test_tune_project_work_orders
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_work_orders(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_project_work_orders(uuid) TO authenticated;

-- get_test_tune_projects
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects(boolean) TO authenticated;

-- get_test_tune_projects_for_user
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_for_user(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects_for_user(uuid, boolean) TO authenticated;

-- get_test_tune_projects_with_variance
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_with_variance(uuid, date, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects_with_variance(uuid, date, date, boolean) TO authenticated;

-- get_test_tune_stats_for_user
REVOKE EXECUTE ON FUNCTION public.get_test_tune_stats_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_tune_stats_for_user(uuid) TO authenticated;

-- get_time_entry_project_id
REVOKE EXECUTE ON FUNCTION public.get_time_entry_project_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_time_entry_project_id(uuid) TO authenticated;

-- get_top_performers
REVOKE EXECUTE ON FUNCTION public.get_top_performers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_performers(integer) TO authenticated;

-- get_upcoming_punchlist_customers
REVOKE EXECUTE ON FUNCTION public.get_upcoming_punchlist_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_upcoming_punchlist_customers() TO authenticated;

-- get_user_accessible_modules
REVOKE EXECUTE ON FUNCTION public.get_user_accessible_modules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_accessible_modules(uuid) TO authenticated;

-- get_user_calendars
REVOKE EXECUTE ON FUNCTION public.get_user_calendars(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_calendars(uuid) TO authenticated;

-- get_user_device_summary
REVOKE EXECUTE ON FUNCTION public.get_user_device_summary(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_device_summary(uuid, integer) TO authenticated;

-- get_user_full_name
REVOKE EXECUTE ON FUNCTION public.get_user_full_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_full_name(uuid) TO authenticated;

-- get_user_location_summary
REVOKE EXECUTE ON FUNCTION public.get_user_location_summary(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_location_summary(uuid, integer) TO authenticated;

-- get_user_module_access
REVOKE EXECUTE ON FUNCTION public.get_user_module_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_module_access(uuid, uuid) TO authenticated;

-- get_user_org_id
REVOKE EXECUTE ON FUNCTION public.get_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;

-- get_user_points_balance
REVOKE EXECUTE ON FUNCTION public.get_user_points_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_points_balance(uuid) TO authenticated;

-- get_user_proposal_visibility_scope
REVOKE EXECUTE ON FUNCTION public.get_user_proposal_visibility_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_proposal_visibility_scope(uuid) TO authenticated;

-- get_user_test_tune_permissions
REVOKE EXECUTE ON FUNCTION public.get_user_test_tune_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_test_tune_permissions(uuid) TO authenticated;

-- get_user_visibility_scope
REVOKE EXECUTE ON FUNCTION public.get_user_visibility_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_visibility_scope() TO authenticated;

-- get_vehicle_statistics
REVOKE EXECUTE ON FUNCTION public.get_vehicle_statistics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vehicle_statistics(uuid) TO authenticated;

-- get_work_order_group_summary
REVOKE EXECUTE ON FUNCTION public.get_work_order_group_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_work_order_group_summary(uuid) TO authenticated;
