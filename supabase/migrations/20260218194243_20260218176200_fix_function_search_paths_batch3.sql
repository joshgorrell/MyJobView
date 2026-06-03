/*
  # Fix Function Search Path Mutable - Batch 3

  ## Summary
  Fixes remaining custom functions with mutable search paths.
*/

ALTER FUNCTION calculate_customer_completeness(text, text, text, text, text, jsonb) SET search_path = public;
ALTER FUNCTION convert_punchlist_tasks_to_service_request(uuid[], uuid, text, text, text, uuid, text) SET search_path = public;
ALTER FUNCTION convert_punchlist_tasks_to_work_order(uuid[], uuid, uuid, text, text, text, text, text, uuid[], timestamp with time zone, numeric, text, text) SET search_path = public;
ALTER FUNCTION test_anon_contact_insert() SET search_path = public;
ALTER FUNCTION update_scheduled_occurrences_updated_at() SET search_path = public;
ALTER FUNCTION update_sticky_notes_updated_at() SET search_path = public;
ALTER FUNCTION update_test_tune_settings_timestamp() SET search_path = public;
ALTER FUNCTION update_time_adj_request_timestamp() SET search_path = public;
