/*
# Set search_path on all mutable-path routines

1. Problem
   - 39 routines in the public schema had no explicit search_path, leaving them
     vulnerable to search-path hijacking if a malicious schema or object shadowed an
     unqualified reference inside the routine body.

2. Changes
   - Iterates over every function in public whose proconfig does not already include a
     search_path setting and pins search_path = public on each one.

3. Notes
   1. The routines' bodies and signatures are not changed.
   2. No data is modified or removed.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NULL
      AND p.proname IN (
        'advance_workflow_enrollment','allocate_billing_amount','assign_segments_to_pay_period',
        'batch_determine_jurisdiction','calculate_change_order_totals','calculate_proposal_totals',
        'classify_deposit_invoice','classify_deposit_on_insert','determine_segment_jurisdiction',
        'determine_work_jurisdiction','enforce_appointment_scheduling_permissions',
        'enforce_customer_location_default','enforce_work_order_scheduling_permissions',
        'enroll_in_workflow','generate_pay_periods','generate_recurring_appointments',
        'get_appointments_needing_reminders','get_billing_classification_composition',
        'get_top_performers','lock_pay_period','lock_sales_compensation_employee',
        'log_sms','log_workflow_email','mark_reminder_sent',
        'prevent_locked_segment_modification','prevent_sales_compensation_overlap',
        'protect_sold_handoff','send_mileage_reminder_emails','set_default_team_pulse_permission',
        'to_minutes','touch_customer_location_updated_at','trigger_generate_recurring_appointments',
        'trigger_set_recap_todo_updated_at','update_menu_items_updated_at','update_pa_updated_at',
        'update_pay_periods_updated_at','update_prf_updated_at','update_pts_updated_at',
        'update_recurring_instances'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
  END LOOP;
END $$;