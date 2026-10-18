/*
# Restrict execution of privileged SECURITY DEFINER routines

1. Problem
   - PostgreSQL grants EXECUTE on every function to PUBLIC by default. Many of these
     routines run as SECURITY DEFINER (the table owner), so any caller -- including the
     unauthenticated anon role -- could invoke payroll, billing, tax, and sales
     dashboard logic and read or mutate any organization's data.

2. Changes
   - For each listed routine, REVOKE EXECUTE FROM PUBLIC and anon, then GRANT EXECUTE
     TO authenticated and service_role. Trigger functions are included for defense in
     depth (the trigger system does not require EXECUTE grants).

3. Notes
   1. Signed-in users and the service role keep full access.
   2. No data is modified or removed.
*/

DO $$
DECLARE
  v_specs text[] := ARRAY[
    'allocate_billing_amount(p_transaction_type text, p_transaction_id uuid, p_amount_to_bill numeric)',
    'generate_pay_periods(p_organization_id uuid, p_start_date date, p_end_date date, p_period_type text)',
    'lock_pay_period(p_pay_period_id uuid, p_locked_by uuid)',
    'regenerate_payroll_segments(p_organization_id uuid, p_start_date date, p_end_date date)',
    'reconcile_payroll_segments(p_pay_period_id uuid)',
    'reconcile_attendance(p_pay_period_id uuid)',
    'reconcile_allocation(p_pay_period_id uuid)',
    'assign_segments_to_pay_period(p_pay_period_id uuid)',
    'create_deposit_invoice_from_proposal(p_proposal_id uuid)',
    'create_deposit_invoice_from_proposal(p_proposal_id uuid, p_invoice_status text)',
    'send_mileage_reminder_emails()',
    'batch_determine_jurisdiction(p_entry_ids uuid[])',
    'determine_work_jurisdiction(p_time_entry_id uuid)',
    'determine_segment_jurisdiction(p_segment_id uuid)',
    'calculate_sales_quota(p_user_id uuid, p_as_of_date date)',
    'classify_deposit_invoice(p_invoice_id uuid, p_proposal_id uuid)',
    'resolve_tax_destination(p_state text, p_org_id uuid, p_contact_id uuid)',
    'resolve_tax_exemption(p_contact_id uuid, p_state text, p_environment text, p_project_type text)',
    'handle_deposit_billing_action()',
    'handle_deposit_billing_action(p_proposal_id uuid, p_send_notification boolean)',
    'get_billing_classification_composition(p_transaction_type text, p_transaction_id uuid)',
    'get_contacts_with_balance(p_limit integer, p_search text, p_type_filter text, p_temperature_filter text, p_view_filter text, p_user_id uuid)',
    'get_contact_counts(p_view_filter text, p_user_id uuid)',
    'get_finance_dashboard_metrics(p_month_start date, p_month_end date)',
    'get_sales_rep_dashboard(p_target_rep_id uuid, p_date_reference date)',
    'get_sales_team_dashboard(p_rep_ids uuid[], p_date_reference date)',
    'get_sales_goal_leaderboard(p_date_reference date)',
    'get_my_sales_dashboard(p_date_reference date)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_specs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', v_sig);
  END LOOP;
END $$;