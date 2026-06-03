/*
  # Fix get_billing_summary function - correct column names

  The function was referencing `co.approval_status` and `co.approved_at` which
  don't exist on the change_orders table. The correct columns are `co.status`
  and `co.approval_date`. Also fixes the jsonb filter logic to use `co->>'status'`
  instead of `co->>'approval_status'` when filtering approved change orders.
*/

CREATE OR REPLACE FUNCTION get_billing_summary(p_sales_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary jsonb;
  v_proposal_total numeric := 0;
  v_change_orders jsonb;
  v_invoices jsonb;
  v_billed_total numeric := 0;
BEGIN
  -- Get proposal total
  SELECT COALESCE(p.total, 0)
  INTO v_proposal_total
  FROM sales_orders so
  LEFT JOIN proposals p ON so.proposal_id = p.id
  WHERE so.id = p_sales_order_id;

  -- Get change orders summary
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'change_order_number', co.change_order_number,
        'description', co.description,
        'change_amount', co.change_amount,
        'tax_amount', co.tax_amount,
        'total_impact', co.new_contract_total - co.original_contract_amount,
        'amount_billed', COALESCE(co.amount_billed, 0),
        'billing_status', co.billing_status,
        'status', co.status,
        'approval_date', co.approval_date
      )
      ORDER BY co.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_change_orders
  FROM change_orders co
  WHERE co.sales_order_id = p_sales_order_id;

  -- Get invoices summary
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'invoice_title', i.invoice_title,
        'source_type', i.source_type,
        'invoice_date', i.invoice_date,
        'due_date', i.due_date,
        'total', i.total,
        'amount_paid', i.amount_paid,
        'amount_due', i.amount_due,
        'status', i.status,
        'billed_from_proposal', i.billed_from_proposal,
        'includes_change_orders', i.includes_change_orders
      )
      ORDER BY i.invoice_date DESC
    ),
    '[]'::jsonb
  )
  INTO v_invoices
  FROM invoices i
  WHERE i.sales_order_id = p_sales_order_id
  AND i.status != 'void';

  -- Calculate total billed
  SELECT COALESCE(SUM(total), 0)
  INTO v_billed_total
  FROM invoices
  WHERE sales_order_id = p_sales_order_id
  AND status != 'void';

  -- Build summary
  v_summary := jsonb_build_object(
    'sales_order_id', p_sales_order_id,
    'proposal_total', v_proposal_total,
    'change_orders', v_change_orders,
    'change_orders_total', (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'status' = 'approved'
    ),
    'contract_total', v_proposal_total + (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'status' = 'approved'
    ),
    'invoices', v_invoices,
    'billed_total', v_billed_total,
    'remaining_balance', v_proposal_total + (
      SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
      FROM jsonb_array_elements(v_change_orders) co
      WHERE co->>'status' = 'approved'
    ) - v_billed_total,
    'billing_progress_percent', CASE 
      WHEN v_proposal_total + (
        SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
        FROM jsonb_array_elements(v_change_orders) co
        WHERE co->>'status' = 'approved'
      ) > 0 
      THEN (v_billed_total / (v_proposal_total + (
        SELECT COALESCE(SUM((co->>'total_impact')::numeric), 0)
        FROM jsonb_array_elements(v_change_orders) co
        WHERE co->>'status' = 'approved'
      )) * 100)
      ELSE 0
    END
  );

  RETURN v_summary;
END;
$$;
