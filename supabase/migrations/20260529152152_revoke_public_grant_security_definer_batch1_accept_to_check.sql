/*
  # Revoke PUBLIC execute grant on SECURITY DEFINER functions — Batch 1 (accept → check)

  Strategy:
  - REVOKE EXECUTE FROM PUBLIC removes the implicit grant that allows both anon
    and authenticated roles to call these functions.
  - GRANT EXECUTE TO authenticated re-grants access only to signed-in users,
    which is the correct scope for all business-logic RPC functions.
  - Trigger functions (apply_time_adjustment) get revoked from everyone since
    they are invoked by Postgres internally, never by client roles.
*/

-- accept_punchlist_invitation
REVOKE EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_punchlist_invitation(uuid) TO authenticated;

-- advance_workflow_enrollment
REVOKE EXECUTE ON FUNCTION public.advance_workflow_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_workflow_enrollment(uuid) TO authenticated;

-- analyze_proposal_pricing
REVOKE EXECUTE ON FUNCTION public.analyze_proposal_pricing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analyze_proposal_pricing(uuid) TO authenticated;

-- apply_bonus_override
REVOKE EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) TO authenticated;

-- apply_change_order
REVOKE EXECUTE ON FUNCTION public.apply_change_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_change_order(uuid) TO authenticated;

-- apply_time_adjustment (trigger function — revoke from all client roles)
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_time_adjustment() FROM anon;

-- archive_work_order
REVOKE EXECUTE ON FUNCTION public.archive_work_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_work_order(uuid, uuid) TO authenticated;

-- award_points
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_points(uuid, integer, text) TO authenticated;

-- calculate_change_order_totals
REVOKE EXECUTE ON FUNCTION public.calculate_change_order_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_change_order_totals(uuid) TO authenticated;

-- calculate_next_occurrence_date
REVOKE EXECUTE ON FUNCTION public.calculate_next_occurrence_date(date, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_next_occurrence_date(date, text, integer, text) TO authenticated;

-- calculate_pm_aggregate_metrics
REVOKE EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_pm_aggregate_metrics(uuid, date, date) TO authenticated;

-- calculate_proposal_items_hash
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_items_hash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_items_hash(uuid) TO authenticated;

-- calculate_proposal_readiness
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_readiness(uuid) TO authenticated;

-- calculate_proposal_totals
REVOKE EXECUTE ON FUNCTION public.calculate_proposal_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_totals(uuid) TO authenticated;

-- calculate_sales_quota
REVOKE EXECUTE ON FUNCTION public.calculate_sales_quota(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_sales_quota(uuid, date) TO authenticated;

-- calculate_technician_mileage
REVOKE EXECUTE ON FUNCTION public.calculate_technician_mileage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_technician_mileage(uuid) TO authenticated;

-- calculate_test_tune_bonus
REVOKE EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) TO authenticated;

-- calculate_trip_distance
REVOKE EXECUTE ON FUNCTION public.calculate_trip_distance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_trip_distance(uuid) TO authenticated;

-- can_convert_to_work_order
REVOKE EXECUTE ON FUNCTION public.can_convert_to_work_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_convert_to_work_order(uuid) TO authenticated;

-- can_view_message_thread
REVOKE EXECUTE ON FUNCTION public.can_view_message_thread(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_message_thread(uuid, uuid) TO authenticated;

-- capture_proposal_snapshot
REVOKE EXECUTE ON FUNCTION public.capture_proposal_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_proposal_snapshot(uuid) TO authenticated;

-- check_change_order_approvals_complete
REVOKE EXECUTE ON FUNCTION public.check_change_order_approvals_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_change_order_approvals_complete(uuid) TO authenticated;

-- check_duplicate_notification
REVOKE EXECUTE ON FUNCTION public.check_duplicate_notification(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_duplicate_notification(uuid, text, integer) TO authenticated;

-- check_proposal_acceptance_requirements
REVOKE EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_proposal_acceptance_requirements(uuid) TO authenticated;
