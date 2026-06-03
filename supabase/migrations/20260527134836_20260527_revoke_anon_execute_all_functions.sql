/*
  # Revoke anon EXECUTE on All Non-Public SECURITY DEFINER Functions

  ## Summary
  Revokes the `anon` role's ability to call SECURITY DEFINER functions via the
  Supabase REST API (/rest/v1/rpc/). These functions run with elevated privileges
  and should not be accessible to unauthenticated users.

  ## Functions Preserved for anon Access (intentionally NOT revoked)
  - submit_security_onboarding: Anonymous portal customer onboarding
  - notify_admins_of_vip_signup: Called by anon VIP signup trigger
  - validate_discount_code: Used in public signup flows
  - get_applicable_tax_rate: Used in anonymous kiosk/VIP flows
  - record_invoice_open: Invoice email open pixel tracking (anonymous)
  - mark_proposal_activity_viewed: Proposal view tracking from email links
  - record_proposal_notification: Proposal notification recording
  - get_contact_portal_access_level: Portal access verification
  - get_punchlist_access_info: Punchlist portal access
  - mark_punchlist_task_completed: Portal punchlist completion
  - request_punchlist_service: Portal punchlist service requests
  - contact_has_punchlist_access: Portal access check
  - contact_has_active_vip_subscription: Portal VIP check
  - get_proposal_payment_methods: Portal proposal payment info

  ## Security Impact
  Prevents anonymous REST API callers from invoking privileged internal
  functions. Only functions with legitimate public/anonymous use cases
  retain anon execute permission.
*/

-- ============================================================
-- TRIGGER FUNCTIONS (should never be called via REST by anon)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.add_revision_entry() FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_workflow_enrollment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.aggregate_location_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_archive_declined_proposals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_clock_out_forgotten_entries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_compute_line_item_totals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_lock_change_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_lock_live_proposals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_set_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_update_billable_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_watch_assigned_task() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_watch_commented_task() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_watch_created_task() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_connection() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_contact() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_fishbowl_post() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_created() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_change_order_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_items_hash(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_line_item_labor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_readiness(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_technician_mileage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_trip_distance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_change_order_approvals_complete(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_notification(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_home_clock_and_notify() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_late_clock_in() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_project_task_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_gps_capture_attempts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cool_down_inactive_contacts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_commission_records_for_invoice() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_contact_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_proposal_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_discussion_post_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_initial_mileage_reminder() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_next_mileage_reminder(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_sales_order_from_proposal() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_subscription_from_contract() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_task_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_travel_bonus_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_vip_work_order_from_appointment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_work_order_from_vip_appointment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_manual_entry_points() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_single_default_calendar() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_contract() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_payment_method() FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_auto_archive_declined_proposals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_midnight_session_cleanup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_scheduled_logout() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_old_proposals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_batch_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_co_number_per_so() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_from_proposal() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_on_project_creation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_proposal_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_scheduled_occurrences() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_statement_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_paid_deposit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_mileage_entry_submission() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_approval() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_reactivation_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_cancellation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_unified_proposal_approval() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_bonus_calculation_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_change_order_action() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_punchlist_task_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_abandoned_signups() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_expired_punchlist_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.midnight_session_cleanup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.monitor_invoice_payment_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_approvers_of_time_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_bug_report() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_creator_service_request_kicked_back() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_completed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_managers_service_request_resubmitted() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_customer_question() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_paparazzi_requester() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_pending_deposit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_rep_of_proposal_message() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_service_managers_new_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_task_status_changed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_tech_of_time_request_outcome() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_time_adjustment_requested() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_watchers_of_comment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_work_order_assignment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.populate_default_starred_modules(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stock_transfer() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_task_comment_mentions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_punchlist_invite() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_field_target_on_change_order_approval() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_proposal_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_subscription_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_project_task() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_pto_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollover_incomplete_occurrences() FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_deposit_request_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_mileage_reminders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_po_request_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_connection_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_contact_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_invoice_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_lead_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_manufacturer_company_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_personal_appointment_defaults() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_product_user_tracking() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_project_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_proposal_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_record_office_and_owner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_recurring_subscription_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_sales_order_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_service_request_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_so_original_contract_total() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_task_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_vendor_company_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_work_order_sales_rep() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_work_order_user_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_account_credit_remaining() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_is_prospect_flag() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_points() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_vip_appointment_to_work_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_proposal_on_line_item_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_proposals_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_history_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_profile_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_contact_qb_sync() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_proposal_totals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_change_order_billing_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_commission_on_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_design_briefs_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_device_nickname_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_internal_time_sessions_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_inventory_on_po_receipt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_ip_nickname_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_items_hash() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_readiness() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_settings_readiness() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_unread_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_weekly_notes_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_pto_balance_on_approval() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_review_requests_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_scope_of_work_timestamp() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_security_contract_timestamp() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_session_logout_schedule_timestamp() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_staff_video_library_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_task_comment_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_vehicle_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_service_request_to_work_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_workflow_email(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_sales_monthly_stats(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_sales_quotas() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_sales_quota_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_sales_quota(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_po_pending_approval() FROM anon;

-- ============================================================
-- INTERNAL RPC FUNCTIONS (authenticated users only, not anon)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analyze_proposal_pricing(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_change_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_work_order(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_convert_to_work_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_message_thread(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_proposal_snapshot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(uuid[], uuid[], date, text, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid, uuid, text, text, timestamp with time zone, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_prospect_to_customer(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], text, text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, uuid, text, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamp with time zone, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(uuid[], text, uuid[], date, time without time zone, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_punchlist_invite(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_promotional_access_grant(uuid, uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_proposal_revision(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_proposal_version(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_punchlist_invite(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.duplicate_work_order_to_technician(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.end_user_session(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enroll_in_workflow(uuid, uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_combined_task_description(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_project_number(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_appointments(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_work_orders(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_sales_order_number(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_sessions_with_cleanup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_all_punchlist_customers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_appointments_needing_reminders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_appointments_with_privacy(uuid, uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_billing_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_gps_quality_report(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_latest_technician_locations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_pricing() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_proposal_sales_order_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_proposal_unread_count(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_auto_clock_outs(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recently_used_products(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_root_proposal_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_session_logout_schedule() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tech_efficiency_for_advisor(date, date, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_technician_route(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_billing_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_labor_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_project_work_orders(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_for_user(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_projects_with_variance(uuid, date, date, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_test_tune_stats_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_time_entry_project_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_performers(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_upcoming_punchlist_customers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_accessible_modules(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_calendars(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_device_summary(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_full_name(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_location_summary(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_module_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_points_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_proposal_visibility_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_test_tune_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_visibility_scope() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_users_needing_mileage_reminders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vehicle_statistics(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_work_order_group_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_billing_action(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_no_deposit_action(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_po_acceptance_action(uuid, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_bypass_rls() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_working_today(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_work_orders(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_proposal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_sms(uuid, uuid, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_reminder_sent(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_settings_section_reviewed(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_sales_rep_of_approval(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_subscription_cancellation(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_revision_to_live(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_scheduled_logout_run(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_contact_portal_access_cache(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_change_order(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.renew_punchlist_access(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_portal_version(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revert_proposal_from_snapshot(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollback_time_entry_import(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_portal_version_snapshot(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_active_revision(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_job_elr_override(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_punchlist_access_suspension(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_revision_portal_visibility(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_change_order_to_proposal(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unarchive_work_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlink_work_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_change_order(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_proposal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_contact_portal_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_labor_phase_mapping(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_pricing(uuid, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_view_record(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_invoice_amount(uuid, numeric, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_next_occurrence_date(date, text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) FROM anon;
