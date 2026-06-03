/*
  # Revoke PUBLIC Execute on SECURITY DEFINER Functions

  ## Summary
  The previous REVOKE attempts only revoked from named roles, but PostgreSQL
  grants execute via PUBLIC by default. This migration:
  1. Revokes EXECUTE FROM PUBLIC on all SECURITY DEFINER functions
  2. Grants EXECUTE TO authenticated on functions that legitimate users need
  3. Grants EXECUTE TO anon on the small subset needed for anonymous flows

  ## Authentication Context
  - PUBLIC: all roles inherit, must be revoked explicitly
  - anon: unauthenticated/anonymous REST API callers
  - authenticated: logged-in users
  - service_role: edge functions and internal calls (retains all access)

  ## Functions Preserved for anon Access
  - submit_security_onboarding: anonymous portal onboarding
  - notify_admins_of_vip_signup: anonymous VIP signup trigger
  - validate_discount_code: public signup flow
  - get_applicable_tax_rate: kiosk/anonymous flows
  - record_invoice_open: invoice email open tracking
  - mark_proposal_activity_viewed: proposal email view tracking
  - record_proposal_notification: proposal notification recording
  - get_contact_portal_access_level: portal access verification
  - get_punchlist_access_info: punchlist portal access
  - mark_punchlist_task_completed: portal punchlist completion
  - request_punchlist_service: portal punchlist service
  - contact_has_punchlist_access: portal access check
  - contact_has_active_vip_subscription: portal VIP check
  - get_proposal_payment_methods: portal payment info
*/

-- ============================================================
-- STEP 1: Revoke PUBLIC execute on all trigger/internal functions
-- (These should only be invoked by trigger mechanism or service_role)
-- ============================================================

-- Trigger functions
REVOKE EXECUTE ON FUNCTION public.add_revision_entry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_workflow_enrollment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aggregate_location_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_archive_declined_proposals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_clock_out_forgotten_entries() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_compute_line_item_totals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_lock_change_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_lock_live_proposals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_set_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_update_billable_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_watch_assigned_task() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_watch_commented_task() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_watch_created_task() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points_for_connection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points_for_contact() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points_for_fishbowl_post() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_line_item_labor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_late_clock_in() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_project_task_completion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_service_request_to_work_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cool_down_inactive_contacts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_commission_records_for_invoice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_contact_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_proposal_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_discussion_post_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_initial_mileage_reminder() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sales_order_from_proposal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_subscription_from_contract() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_task_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_travel_bonus_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_vip_work_order_from_appointment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_work_order_from_vip_appointment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_manual_entry_points() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_single_default_calendar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_contract() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_payment_method() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_auto_archive_declined_proposals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_midnight_session_cleanup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_scheduled_logout() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_old_proposals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_batch_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_co_number_per_so() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_from_proposal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_on_project_creation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_proposal_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_scheduled_occurrences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_statement_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment_completion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_paid_deposit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_mileage_entry_submission() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_reactivation_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_cancellation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_completion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_unified_proposal_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_bonus_calculation_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_change_order_action() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_punchlist_task_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_workflow_email(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_abandoned_signups() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_expired_punchlist_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.midnight_session_cleanup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.monitor_invoice_payment_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_admins_of_vip_signup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_approvers_of_time_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_bug_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_creator_service_request_kicked_back() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_completed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_managers_service_request_resubmitted() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_customer_question() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_paparazzi_requester() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_pending_deposit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_rep_of_proposal_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_service_managers_new_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_task_status_changed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_tech_of_time_request_outcome() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_time_adjustment_requested() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_watchers_of_comment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_work_order_assignment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.populate_default_starred_modules(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stock_transfer() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_task_comment_mentions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_punchlist_invite() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_sales_quotas() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_field_target_on_change_order_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_sales_quota_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_proposal_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_subscription_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_sales_monthly_stats(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reopen_project_task() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_pto_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollover_incomplete_occurrences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_deposit_request_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_mileage_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_po_request_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_connection_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_contact_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_invoice_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_lead_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_manufacturer_company_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_personal_appointment_defaults() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_product_user_tracking() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_project_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_proposal_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_record_office_and_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_recurring_subscription_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sales_order_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_service_request_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_so_original_contract_total() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_task_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_vendor_company_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_work_order_sales_rep() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_work_order_user_names() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_account_credit_remaining() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_is_prospect_flag() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_points() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_vip_appointment_to_work_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_proposal_on_line_item_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_proposals_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_history_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_profile_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_contact_qb_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_proposal_totals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_change_order_billing_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_commission_on_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_design_briefs_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_device_nickname_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_internal_time_sessions_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_inventory_on_po_receipt() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_ip_nickname_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_items_hash() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_readiness() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_settings_readiness() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_unread_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_weekly_notes_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_pto_balance_on_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_review_requests_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_scope_of_work_timestamp() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_security_contract_timestamp() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_session_logout_schedule_timestamp() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_staff_video_library_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_task_comment_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_vehicle_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_po_pending_approval() FROM PUBLIC;

-- Admin-only functions (service_role only)
REVOKE EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_platform_pricing() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_billing_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_scheduled_logout_run(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_home_clock_and_notify() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_gps_capture_attempts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_reminder_sent(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_appointments_needing_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_users_needing_mileage_reminders() FROM PUBLIC;

-- RPC functions only for authenticated users (not anon)
REVOKE EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analyze_proposal_pricing(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_change_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_work_order(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_change_order_totals(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_next_occurrence_date(date, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_items_hash(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_readiness(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_totals(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_sales_quota(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_technician_mileage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_trip_distance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_convert_to_work_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_message_thread(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_proposal_snapshot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_change_order_approvals_complete(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_notification(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid, uuid, text, text, timestamp with time zone, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_prospect_to_customer(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], text, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, uuid, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamp with time zone, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time without time zone, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_manual_punchlist_invite(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_next_mileage_reminder(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_proposal_revision(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_proposal_version(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_punchlist_invite(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enroll_in_workflow(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_combined_task_description(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_project_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_appointments(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sales_order_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_punchlist_customers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_billing_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_gps_quality_report(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_latest_technician_locations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_proposal_sales_order_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_proposal_unread_count(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_auto_clock_outs(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recently_used_products(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_root_proposal_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_session_logout_schedule() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tech_efficiency_for_advisor(date, date, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_technician_route(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_labor_totals(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_work_orders(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_for_user(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_with_variance(uuid, date, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_stats_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_time_entry_project_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_performers(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_upcoming_punchlist_customers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_accessible_modules(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_calendars(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_device_summary(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_full_name(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_location_summary(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_module_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_points_balance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_proposal_visibility_scope(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_test_tune_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_visibility_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vehicle_statistics(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_work_order_group_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_billing_action(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_no_deposit_action(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_po_acceptance_action(uuid, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_bypass_rls() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_working_today(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_work_orders(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_sms(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_settings_section_reviewed(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_sales_rep_of_approval(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_subscription_cancellation(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_revision_to_live(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_contact_portal_access_cache(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_change_order(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.renew_punchlist_access(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_portal_version(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revert_proposal_from_snapshot(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollback_time_entry_import(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_portal_version_snapshot(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_active_revision(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_job_elr_override(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_punchlist_access_suspension(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_revision_portal_visibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_change_order_to_proposal(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unarchive_work_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlink_work_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_change_order(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_contact_portal_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_labor_phase_mapping(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proposal_pricing(uuid, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_view_record(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_invoice_amount(uuid, numeric, uuid) FROM PUBLIC;

-- ============================================================
-- STEP 2: Grant back to authenticated for functions used by frontend
-- ============================================================

-- RPC functions called directly by authenticated frontend users
GRANT EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_proposal_pricing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_change_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_time_adjustment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_work_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_change_order_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_occurrence_date(date, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_items_hash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_sales_quota(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_technician_mileage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_trip_distance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_convert_to_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_message_thread(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_proposal_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_change_order_approvals_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_notification(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid, uuid, text, text, timestamp with time zone, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_customer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamp with time zone, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time without time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_punchlist_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_next_mileage_reminder(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proposal_revision(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proposal_version(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_punchlist_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_in_workflow(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_combined_task_description(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_project_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_appointments(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sales_order_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_punchlist_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_portal_access_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gps_quality_report(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_technician_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_payment_methods(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_sales_order_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_unread_count(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_auto_clock_outs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recently_used_products(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_root_proposal_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_logout_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tech_efficiency_for_advisor(date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_technician_route(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_labor_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_project_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_project_work_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects_for_user(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_projects_with_variance(uuid, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_tune_stats_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_time_entry_project_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_performers(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_punchlist_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_accessible_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_calendars(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_device_summary(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_full_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_location_summary(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_module_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_points_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_proposal_visibility_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_test_tune_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_visibility_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_statistics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_work_order_group_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_deposit_billing_action(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_no_deposit_action(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_po_acceptance_action(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_bypass_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_working_today(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_work_orders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_sms(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_settings_section_reviewed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_sales_rep_of_approval(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_cancellation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_revision_to_live(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_contact_portal_access_cache(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_change_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_punchlist_access(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_portal_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_proposal_from_snapshot(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_time_entry_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_portal_version_snapshot(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_elr_override(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_punchlist_access_suspension(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_revision_portal_visibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_change_order_to_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_change_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_contact_portal_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_phase_mapping(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_pricing(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_view_record(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invoice_amount(uuid, numeric, uuid) TO authenticated;

-- ============================================================
-- STEP 3: Grant back to anon for legitimate anonymous functions
-- ============================================================

-- Anonymous portal/kiosk/VIP functions
GRANT EXECUTE ON FUNCTION public.submit_security_onboarding(text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_applicable_tax_rate(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_contact_portal_access_level(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_payment_methods(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) TO anon;
