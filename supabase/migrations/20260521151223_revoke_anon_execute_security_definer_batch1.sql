/*
  # Revoke anon EXECUTE on SECURITY DEFINER functions - Batch 1 (a-c)

  ## Summary
  Revokes the anon role's ability to execute SECURITY DEFINER functions.
  These are internal trigger/business logic functions that should never
  be callable by unauthenticated users. Public URL access and portal
  functionality use authenticated sessions and are unaffected.

  All functions listed here are internal to the application and have no
  legitimate use case for anonymous callers.
*/

REVOKE EXECUTE ON FUNCTION public.accept_punchlist_invitation(p_contact_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_revision_entry() FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_workflow_enrollment(p_enrollment_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.aggregate_location_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.analyze_proposal_pricing(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_bonus_override(p_sales_order_id uuid, p_employee_id uuid, p_override_amount numeric, p_reason text, p_admin_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_change_order(p_change_order_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_work_order(p_work_order_id uuid, p_user_id uuid) FROM anon;
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
REVOKE EXECUTE ON FUNCTION public.award_points(p_user_id uuid, p_points integer, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_connection() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_contact() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_fishbowl_post() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_created() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points_for_lead_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_change_order_totals(p_change_order_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_next_occurrence_date(p_current_date date, p_pattern text, p_interval integer, p_day_rule text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(p_pm_id uuid, p_start_date date, p_end_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_items_hash(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_line_item_labor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_readiness(proposal_id_input uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_totals(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_sales_quota(p_user_id uuid, p_as_of_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_technician_mileage(p_clock_entry_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_test_tune_bonus(p_sales_order_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_trip_distance(p_daily_clock_entry_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_convert_to_work_order(p_service_request_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_message_thread(user_id uuid, thread_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_proposal_snapshot(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_change_order_approvals_complete(p_change_order_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_notification(p_proposal_id uuid, p_notification_type text, p_hours_window integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_home_clock_and_notify() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_late_clock_in() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_project_task_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_gps_capture_attempts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.combine_service_requests_to_work_order(p_service_request_ids uuid[], p_tech_ids uuid[], p_scheduled_date date, p_scheduled_time text, p_estimated_hours numeric, p_description text, p_internal_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_po_pending_approval() FROM anon;
REVOKE EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(p_contact_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.contact_has_punchlist_access(p_contact_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_prospect(p_lead_id uuid, p_competitor_id uuid, p_relationship_type text, p_relationship_strength text, p_follow_up_date timestamp with time zone, p_follow_up_type text, p_follow_up_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_prospect_to_customer(p_contact_id uuid, p_proposal_id uuid, p_proposal_number text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(p_task_ids uuid[], p_description text, p_urgency text, p_scheduled_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(p_task_ids uuid[], p_contact_id uuid, p_billable_type text, p_billable_by text, p_billable_by_user_id uuid, p_priority text, p_requested_tech_ids uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_service_request(p_task_ids uuid[], p_contact_id uuid, p_priority text, p_billable_type text, p_billable_by text, p_billable_by_user_id uuid, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(p_task_ids uuid[], p_description text, p_assigned_to uuid[], p_scheduled_date date, p_scheduled_time time without time zone, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_punchlist_tasks_to_work_order(p_task_ids uuid[], p_contact_id uuid, p_project_id uuid, p_work_order_type text, p_billable_type text, p_priority text, p_title text, p_description_override text, p_assigned_technician_ids uuid[], p_start_date timestamp with time zone, p_estimated_hours numeric, p_notes text, p_internal_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_service_request_to_work_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cool_down_inactive_contacts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_commission_records_for_invoice() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_contact_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_proposal_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(p_proposal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_deposit_invoice_from_proposal(p_proposal_id uuid, p_invoice_status text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_discussion_post_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_initial_mileage_reminder() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_punchlist_invite(p_contact_id uuid, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_next_mileage_reminder(p_user_id uuid, p_vehicle_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_promotional_access_grant(p_contact_id uuid, p_project_id uuid, p_days integer, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_proposal_revision(p_proposal_id uuid, p_revision_name text, p_created_by uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_proposal_version(p_proposal_id uuid, p_changed_by uuid, p_change_description text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_sales_order_from_proposal() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_subscription_from_contract() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_task_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_travel_bonus_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_vip_work_order_from_appointment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_work_order_from_vip_appointment() FROM anon;
