/*
  # Fix Function Search Path Mutable - Batch 1

  ## Summary
  Sets search_path = public on custom application functions that have a mutable
  search path. This prevents potential search path injection attacks.

  Note: Extension-owned functions (http_*, bytea_to_text, text_to_bytea) are
  excluded as they cannot be modified by the application owner.

  ## Functions Fixed (Batch 1: a-g)
*/

ALTER FUNCTION accept_punchlist_invitation(uuid) SET search_path = public;
ALTER FUNCTION aggregate_location_metrics() SET search_path = public;
ALTER FUNCTION award_points_for_contact() SET search_path = public;
ALTER FUNCTION calculate_change_order_totals(uuid) SET search_path = public;
ALTER FUNCTION calculate_convenience_fee(numeric, text) SET search_path = public;
ALTER FUNCTION calculate_gps_quality_score(real, text, integer, boolean, real) SET search_path = public;
ALTER FUNCTION calculate_next_occurrence_date(date, text, integer, text) SET search_path = public;
ALTER FUNCTION calculate_product_price() SET search_path = public;
ALTER FUNCTION calculate_proposal_totals(uuid) SET search_path = public;
ALTER FUNCTION calculate_technician_mileage(uuid) SET search_path = public;
ALTER FUNCTION calculate_trip_distance(uuid) SET search_path = public;
ALTER FUNCTION check_home_clock_and_notify() SET search_path = public;
ALTER FUNCTION check_late_clock_in() SET search_path = public;
ALTER FUNCTION check_po_billing_complete() SET search_path = public;
ALTER FUNCTION cleanup_old_gps_capture_attempts() SET search_path = public;
ALTER FUNCTION contact_has_active_vip_subscription(uuid) SET search_path = public;
ALTER FUNCTION create_commission_records_for_invoice() SET search_path = public;
ALTER FUNCTION create_proposal_revision(uuid, text, uuid) SET search_path = public;
ALTER FUNCTION create_travel_bonus_request() SET search_path = public;
ALTER FUNCTION create_vip_work_order_from_appointment() SET search_path = public;
ALTER FUNCTION deduct_manual_entry_points() SET search_path = public;
ALTER FUNCTION enforce_single_default_calendar() SET search_path = public;
ALTER FUNCTION ensure_single_default_payment_method() SET search_path = public;
ALTER FUNCTION generate_batch_number() SET search_path = public;
ALTER FUNCTION generate_device_signature(text, text, text) SET search_path = public;
ALTER FUNCTION generate_scheduled_occurrences() SET search_path = public;
ALTER FUNCTION generate_security_contract_number() SET search_path = public;
ALTER FUNCTION generate_statement_number() SET search_path = public;
ALTER FUNCTION get_default_company_id() SET search_path = public;
ALTER FUNCTION get_effective_commission_rate(uuid, text) SET search_path = public;
ALTER FUNCTION get_gps_quality_report(uuid, date, date) SET search_path = public;
ALTER FUNCTION get_latest_technician_locations() SET search_path = public;
ALTER FUNCTION get_line_item_phase_count(uuid) SET search_path = public;
ALTER FUNCTION get_line_item_total_labor_hours(uuid) SET search_path = public;
ALTER FUNCTION get_proposal_activity_summary(uuid) SET search_path = public;
ALTER FUNCTION get_proposal_unread_count(uuid, text) SET search_path = public;
ALTER FUNCTION get_recent_auto_clock_outs(integer) SET search_path = public;
ALTER FUNCTION get_recently_used_products(uuid, integer) SET search_path = public;
ALTER FUNCTION get_root_proposal_id(uuid) SET search_path = public;
ALTER FUNCTION get_technician_route(uuid) SET search_path = public;
ALTER FUNCTION get_test_tune_labor_totals(uuid) SET search_path = public;
ALTER FUNCTION get_user_calendars(uuid) SET search_path = public;
ALTER FUNCTION grant_punchlist_access_directly(uuid, integer, text) SET search_path = public;
