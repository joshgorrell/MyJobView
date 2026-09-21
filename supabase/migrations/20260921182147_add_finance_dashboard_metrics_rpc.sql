-- Finance Dashboard metrics RPC
-- Returns aggregated invoice KPIs for the calling user's organization.
-- Organization scope is derived from auth context via get_user_org_id()
-- — never from a client-supplied parameter.
-- Follows the existing SECURITY DEFINER convention from get_contacts_with_balance.

CREATE OR REPLACE FUNCTION get_finance_dashboard_metrics(
  p_month_start date,
  p_month_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  v_org_id := get_user_org_id();

  SELECT jsonb_build_object(
    'sales_invoiced', COALESCE(SUM(total) FILTER (
      WHERE status NOT IN ('draft', 'void')
    ), 0),
    'monthly_sales_invoiced', COALESCE(SUM(total) FILTER (
      WHERE status NOT IN ('draft', 'void')
        AND invoice_date >= p_month_start
        AND invoice_date <= p_month_end
    ), 0),
    'accounts_receivable', COALESCE(SUM(amount_due) FILTER (
      WHERE status NOT IN ('draft', 'void')
    ), 0),
    'paid_invoices', COUNT(*) FILTER (
      WHERE status = 'paid'
    ),
    'partial_invoices', COUNT(*) FILTER (
      WHERE status = 'partial'
    ),
    'overdue_invoices', COUNT(*) FILTER (
      WHERE status = 'overdue'
         OR (amount_due > 0 AND due_date IS NOT NULL AND due_date::text < p_month_start::text)
    )
  )
  INTO v_result
  FROM invoices
  WHERE organization_id = v_org_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_finance_dashboard_metrics TO authenticated;
