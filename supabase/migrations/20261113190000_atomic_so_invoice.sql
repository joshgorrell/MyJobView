-- One transaction for SO invoice, classification lines, schedule allocations,
-- CO links and CO billing balances. Runs as caller with existing table RLS.
CREATE OR REPLACE FUNCTION public.create_sales_order_invoice_atomic(
  p_invoice jsonb,
  p_line_items jsonb,
  p_schedule_allocations jsonb DEFAULT '[]'::jsonb,
  p_co_links jsonb DEFAULT '[]'::jsonb,
  p_account_credit jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_so uuid;
  v_id uuid;
  v_co record;
  v_total numeric;
  v_billed numeric;
  v_new numeric;
  v_status text;
  v_expected_links integer;
BEGIN
  IF jsonb_typeof(p_invoice) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_line_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_line_items) = 0
    OR jsonb_typeof(p_schedule_allocations) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_co_links) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid invoice payload';
  END IF;
  v_so := (p_invoice->>'sales_order_id')::uuid;
  IF v_so IS NULL THEN RAISE EXCEPTION 'Sales Order is required'; END IF;
  -- Serializes competing invoices, including the existing contract-cap trigger.
  PERFORM 1 FROM public.sales_orders WHERE id = v_so FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order not found'; END IF;
  IF p_invoice ? 'id' OR p_invoice ? 'qbo_invoice_id' THEN
    RAISE EXCEPTION 'Invoice identity is assigned by the database';
  END IF;
  INSERT INTO public.invoices (
    company_id, organization_id, contact_id, project_id, sales_order_id,
    invoice_date, due_date, status, subtotal, tax_amount, total,
    amount_paid, amount_due, notes, invoice_title, source_type,
    includes_change_orders, tax_environment, tax_project_type, payment_terms,
    invoice_type, billing_phase_id, created_by, created_by_name
  ) SELECT company_id, organization_id, contact_id, project_id, sales_order_id,
    invoice_date, due_date, status, subtotal, tax_amount, total,
    amount_paid, amount_due, notes, invoice_title, source_type,
    includes_change_orders, tax_environment, tax_project_type, payment_terms,
    invoice_type, billing_phase_id, created_by, created_by_name
  FROM jsonb_populate_record(NULL::public.invoices, p_invoice)
  RETURNING * INTO v_invoice;
  v_id := v_invoice.id;

  INSERT INTO public.invoice_line_items (
    invoice_id, description, quantity, unit_price, amount, item_type,
    is_taxable, tax_amount, tax_classification_id, sort_order
  )
  SELECT v_id, description, quantity, unit_price, amount, item_type,
    is_taxable, tax_amount, tax_classification_id, sort_order
  FROM jsonb_populate_recordset(NULL::public.invoice_line_items, p_line_items);

  INSERT INTO public.sales_order_billing_row_allocations
    (billing_row_id, invoice_id, amount, description_snapshot)
  SELECT (item->>'billing_row_id')::uuid, v_id,
         (item->>'amount')::numeric, item->>'description_snapshot'
  FROM jsonb_array_elements(p_schedule_allocations) item;

  -- Duplicate CO ids must not be billed twice in one request.
  SELECT count(*) INTO v_expected_links FROM jsonb_array_elements(p_co_links);
  IF v_expected_links <> (SELECT count(DISTINCT item->>'change_order_id') FROM jsonb_array_elements(p_co_links) item) THEN
    RAISE EXCEPTION 'Duplicate Change Order billing links';
  END IF;
  -- Lock COs in deterministic order. Recalculate from authoritative stored
  -- amounts, never client-provided previous balances.
  FOR v_co IN
    SELECT co.id, co.change_amount, co.tax_amount, co.amount_billed,
           (item->>'amount_billed')::numeric AS delta,
           so.company_id AS company_id
    FROM jsonb_array_elements(p_co_links) item
    JOIN public.change_orders co ON co.id = (item->>'change_order_id')::uuid
    JOIN public.sales_orders so ON so.id = co.sales_order_id
    WHERE co.sales_order_id = v_so AND co.status = 'approved'
      AND co.is_billable IS DISTINCT FROM false
    ORDER BY co.id
    FOR UPDATE OF co
  LOOP
    IF v_co.delta IS NULL OR v_co.delta = 0 OR (v_co.change_amount < 0 AND v_co.delta > 0) OR (v_co.change_amount >= 0 AND v_co.delta < 0) THEN
      RAISE EXCEPTION 'Invalid Change Order billing amount';
    END IF;
    v_total := CASE WHEN v_co.change_amount < 0
      THEN v_co.change_amount - abs(coalesce(v_co.tax_amount,0))
      ELSE abs(v_co.change_amount) + coalesce(v_co.tax_amount,0) END;
    v_billed := coalesce(v_co.amount_billed,0);
    v_new := v_billed + v_co.delta;
    IF (v_total >= 0 AND (v_new < -0.005 OR v_new > v_total + 0.005))
       OR (v_total < 0 AND (v_new > 0.005 OR v_new < v_total - 0.005)) THEN
      RAISE EXCEPTION 'Change Order billing exceeds approved amount';
    END IF;
    v_status := CASE WHEN abs(v_new) < 0.005 THEN 'unbilled'
      WHEN abs(v_new - v_total) < 0.005 THEN 'fully_billed'
      ELSE 'partially_billed' END;
    INSERT INTO public.invoice_change_order_links
      (company_id, invoice_id, change_order_id, amount_billed, fully_billed)
    VALUES (v_co.company_id::uuid, v_id, v_co.id, v_co.delta, v_status = 'fully_billed');
    UPDATE public.change_orders
    SET amount_billed = v_new, billing_status = v_status
    WHERE id = v_co.id;
  END LOOP;
  IF v_expected_links <>
     (SELECT count(*) FROM jsonb_array_elements(p_co_links) item
      JOIN public.change_orders co ON co.id = (item->>'change_order_id')::uuid
      WHERE co.sales_order_id = v_so AND co.status = 'approved'
        AND co.is_billable IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Invalid or unapproved Change Order';
  END IF;

  IF p_account_credit IS NOT NULL THEN
    INSERT INTO public.customer_account_credits
      (organization_id, contact_id, sales_order_id, source_invoice_id,
       amount, amount_applied, status, notes, created_by)
    SELECT organization_id, contact_id, sales_order_id, v_id,
       amount, amount_applied, status, notes, created_by
    FROM jsonb_populate_record(NULL::public.customer_account_credits, p_account_credit);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sales_order_invoice_atomic(jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_invoice_atomic(jsonb,jsonb,jsonb,jsonb,jsonb) TO authenticated;
