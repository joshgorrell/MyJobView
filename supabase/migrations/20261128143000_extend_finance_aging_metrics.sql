-- Extend the existing Finance dashboard aggregate, preserving its AR basis.
CREATE OR REPLACE FUNCTION public.get_finance_dashboard_metrics(p_month_start date, p_month_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $finance_metrics$
DECLARE v_org_id uuid; v_result jsonb; v_today date; v_timezone text;
BEGIN
  v_org_id := get_user_org_id();
  SELECT timezone INTO v_timezone FROM organizations WHERE id=v_org_id;
  IF v_timezone IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    v_today := (now() AT TIME ZONE v_timezone)::date;
  END IF;
  SELECT jsonb_build_object(
    'sales_invoiced', COALESCE(SUM(total) FILTER (WHERE status NOT IN ('draft','void')),0),
    'monthly_sales_invoiced', COALESCE(SUM(total) FILTER (WHERE status NOT IN ('draft','void') AND invoice_date BETWEEN p_month_start AND p_month_end),0),
    'accounts_receivable', COALESCE(SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void')),0),
    'paid_invoices', COUNT(*) FILTER (WHERE status='paid'),
    'partial_invoices', COUNT(*) FILTER (WHERE status='partial'),
    'overdue_invoices', CASE WHEN v_today IS NULL THEN NULL ELSE COUNT(*) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND due_date<v_today) END,
    'aging_as_of', v_today,
    'aging_current', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND due_date>=v_today),
    'aging_1_30', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND v_today-due_date BETWEEN 1 AND 30),
    'aging_31_60', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND v_today-due_date BETWEEN 31 AND 60),
    'aging_61_90', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND v_today-due_date BETWEEN 61 AND 90),
    'aging_over_90', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND v_today-due_date>90),
    'aging_unknown_date', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due>0 AND due_date IS NULL),
    'aging_credits', SUM(amount_due) FILTER (WHERE status NOT IN ('draft','void') AND amount_due<0)
  ) INTO v_result FROM invoices WHERE organization_id=v_org_id;
  RETURN v_result;
END;
$finance_metrics$;
