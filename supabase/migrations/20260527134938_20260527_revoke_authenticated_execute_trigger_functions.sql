/*
  # Revoke authenticated EXECUTE on Trigger/Internal SECURITY DEFINER Functions

  ## Summary
  The `authenticated` role should not be able to call trigger functions and
  internal helper functions directly via the REST API. These functions are
  designed to be called automatically by database triggers or by the
  service_role/edge functions, not by authenticated users via RPC.

  ## Functions Revoked from authenticated Role
  All trigger functions (those that return `trigger` type), internal processing
  functions, and admin-only functions that should not be directly invocable
  by regular authenticated users.

  ## Functions Preserved for authenticated Access
  All legitimate RPC functions that the frontend calls on behalf of authenticated
  users are preserved (accept_punchlist_invitation, apply_change_order, etc.)

  ## Security Impact
  Reduces the attack surface for authenticated users who could otherwise
  invoke privileged trigger functions with elevated (SECURITY DEFINER) privileges.
*/

-- Trigger functions (return trigger, should never be called directly)
REVOKE EXECUTE ON FUNCTION public.add_revision_entry() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_compute_line_item_totals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_lock_change_order() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_lock_live_proposals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_set_invoice_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_update_billable_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_watch_assigned_task() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_watch_commented_task() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_watch_created_task() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points_for_connection() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points_for_contact() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points_for_fishbowl_post() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_created() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_status_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_line_item_labor() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_late_clock_in() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_project_task_completion() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_service_request_to_work_order() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cool_down_inactive_contacts() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_commission_records_for_invoice() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_contact_event() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_proposal_settings() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_discussion_post_event() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_initial_mileage_reminder() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_sales_order_from_proposal() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_subscription_from_contract() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_task_event() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_travel_bonus_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_vip_work_order_from_appointment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_work_order_from_vip_appointment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_manual_entry_points() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_single_default_calendar() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_contract() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_payment_method() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_batch_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_co_number_per_so() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_from_proposal() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_project_tasks_on_project_creation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_proposal_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_scheduled_occurrences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_statement_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_deposit_payment_completion() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_paid_deposit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_mileage_entry_submission() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_approval() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_proposal_reactivation_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_cancellation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_service_request_completion() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_unified_proposal_approval() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_bonus_calculation_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_change_order_action() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_punchlist_task_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_abandoned_signups() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_expired_punchlist_access() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.monitor_invoice_payment_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_approvers_of_time_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_bug_report() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_creator_service_request_kicked_back() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_completed() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_payment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_deposit_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_managers_service_request_resubmitted() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_customer_question() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_paparazzi_requester() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pending_deposit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_rep_of_proposal_message() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_service_managers_new_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_status_changed() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_tech_of_time_request_outcome() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_time_adjustment_requested() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_watchers_of_comment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_work_order_assignment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_stock_transfer() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_task_comment_mentions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_punchlist_invite() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_field_target_on_change_order_approval() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_proposal_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_portal_access_on_subscription_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_project_task() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_pto_balance() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rollover_incomplete_occurrences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_deposit_request_notification() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_po_request_notification() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_connection_notifications() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_contact_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_invoice_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_lead_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_manufacturer_company_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_personal_appointment_defaults() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_product_user_tracking() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_project_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_proposal_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_record_office_and_owner() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_recurring_subscription_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_sales_order_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_service_request_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_so_original_contract_total() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_task_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_vendor_company_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_work_order_sales_rep() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_work_order_user_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_credit_remaining() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_is_prospect_flag() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_points() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vip_appointment_to_work_order() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_proposal_on_line_item_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_proposals_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_history_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_quota_on_profile_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_contact_qb_sync() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_proposal_totals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_change_order_billing_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_commission_on_payment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_design_briefs_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_device_nickname_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_internal_time_sessions_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_inventory_on_po_receipt() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_ip_nickname_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_items_hash() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_readiness() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_settings_readiness() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_unread_count() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_weekly_notes_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_pto_balance_on_approval() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_review_requests_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_scope_of_work_timestamp() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_security_contract_timestamp() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_session_logout_schedule_timestamp() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_staff_video_library_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_task_comment_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_vehicle_updated_at() FROM authenticated;

-- Admin-only functions (service_role only, not for regular authenticated users)
REVOKE EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_pricing() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tenant_billing_summary(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_auto_archive_declined_proposals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_midnight_session_cleanup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_scheduled_logout() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_scheduled_logout_run(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.midnight_session_cleanup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_clock_out_forgotten_entries() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_archive_declined_proposals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_proposals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_gps_capture_attempts() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_sessions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.send_mileage_reminders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_users_needing_mileage_reminders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_appointments_needing_reminders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_reminder_sent(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_home_clock_and_notify() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.aggregate_location_metrics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_sales_quotas() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_workflow_email(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_of_vip_signup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_po_pending_approval() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.populate_default_starred_modules(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_sales_monthly_stats(uuid, uuid) FROM authenticated;
