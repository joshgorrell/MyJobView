/*
  # Fix Function Search Path Mutable - Batch 2

  ## Summary
  Continues setting search_path = public on remaining custom functions.

  ## Functions Fixed (Batch 2: h-z)
*/

ALTER FUNCTION handle_mileage_entry_submission() SET search_path = public;
ALTER FUNCTION handle_proposal_reactivation_request() SET search_path = public;
ALTER FUNCTION handle_service_request_cancellation() SET search_path = public;
ALTER FUNCTION is_at_home_location(numeric, numeric, numeric, numeric, integer) SET search_path = public;
ALTER FUNCTION is_contact_ready_for_qb_sync(uuid) SET search_path = public;
ALTER FUNCTION is_working_today(uuid, date) SET search_path = public;
ALTER FUNCTION log_bonus_calculation_change() SET search_path = public;
ALTER FUNCTION notify_admins_of_vip_signup() SET search_path = public;
ALTER FUNCTION notify_bug_report() SET search_path = public;
ALTER FUNCTION notify_paparazzi_requester() SET search_path = public;
ALTER FUNCTION notify_rep_of_proposal_message() SET search_path = public;
ALTER FUNCTION notify_time_adjustment_review() SET search_path = public;
ALTER FUNCTION reserve_pto_balance() SET search_path = public;
ALTER FUNCTION rollback_time_entry_import(uuid) SET search_path = public;
ALTER FUNCTION rollover_incomplete_occurrences() SET search_path = public;
ALTER FUNCTION send_mileage_reminders() SET search_path = public;
ALTER FUNCTION set_active_revision(uuid) SET search_path = public;
ALTER FUNCTION set_default_descriptions() SET search_path = public;
ALTER FUNCTION set_manufacturer_company_id() SET search_path = public;
ALTER FUNCTION set_product_user_tracking() SET search_path = public;
ALTER FUNCTION set_vendor_company_id() SET search_path = public;
ALTER FUNCTION set_work_order_sales_rep() SET search_path = public;
ALTER FUNCTION should_create_deposit_invoice(text, boolean, boolean, boolean) SET search_path = public;
ALTER FUNCTION sync_is_prospect_flag() SET search_path = public;
ALTER FUNCTION sync_vip_appointment_to_work_order() SET search_path = public;
ALTER FUNCTION toggle_revision_portal_visibility(uuid) SET search_path = public;
ALTER FUNCTION track_first_completion() SET search_path = public;
ALTER FUNCTION trigger_recalculate_proposal_totals() SET search_path = public;
ALTER FUNCTION update_commission_on_payment() SET search_path = public;
ALTER FUNCTION update_company_messages_updated_at() SET search_path = public;
ALTER FUNCTION update_line_item_labor_phases_updated_at() SET search_path = public;
ALTER FUNCTION update_product_colors_updated_at() SET search_path = public;
ALTER FUNCTION update_product_labor_phases_updated_at() SET search_path = public;
ALTER FUNCTION update_product_request_timestamp() SET search_path = public;
ALTER FUNCTION update_project_tasks_updated_at() SET search_path = public;
ALTER FUNCTION update_proposal_messages_updated_at() SET search_path = public;
ALTER FUNCTION update_pto_balance_on_approval() SET search_path = public;
ALTER FUNCTION update_scheduled_connections_updated_at() SET search_path = public;
