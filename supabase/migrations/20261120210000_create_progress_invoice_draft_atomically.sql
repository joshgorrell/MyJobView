CREATE FUNCTION public.create_progress_invoice_draft(
  p_header jsonb, p_lines jsonb, p_change_orders jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  header public.invoices;
  draft_id uuid;
  line_total numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a project invoice.';
  END IF;
  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_change_orders) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid project invoice data.';
  END IF;

  header := jsonb_populate_record(NULL::public.invoices, p_header);
  IF header.sales_order_id IS NULL OR header.source_type IS NULL
    OR header.source_type NOT IN ('progress', 'final', 'manual') THEN
    RAISE EXCEPTION 'A sales order and valid invoice type are required.';
  END IF;

  SELECT round(sum(line.amount), 2) INTO line_total
  FROM jsonb_populate_recordset(NULL::public.invoice_line_items, p_lines) AS line;
  IF line_total IS NULL OR line_total <= 0 OR line_total IS DISTINCT FROM header.subtotal THEN
    RAISE EXCEPTION 'All billed amounts must be represented by invoice lines.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.invoice_change_order_links, p_change_orders) AS link
    LEFT JOIN public.change_orders AS change_order
      ON change_order.id = link.change_order_id AND change_order.sales_order_id = header.sales_order_id
    WHERE change_order.id IS NULL OR change_order.approval_status IS DISTINCT FROM 'approved'
      OR link.amount_billed IS NULL OR link.amount_billed <= 0
      OR link.amount_billed > change_order.change_amount - coalesce(change_order.amount_billed, 0)
  ) THEN
    RAISE EXCEPTION 'An approved change order or its remaining balance changed. Reopen the invoice and retry.';
  END IF;

  INSERT INTO public.invoices (
    company_id, sales_order_id, proposal_id, contact_id, invoice_title, source_type,
    invoice_date, due_date, subtotal, tax_amount, tax_rate, total, amount_paid,
    amount_due, status, portal_visible, payment_terms, notes, billed_from_proposal,
    includes_change_orders, created_by, created_by_name
  ) VALUES (
    header.company_id, header.sales_order_id, header.proposal_id, header.contact_id,
    header.invoice_title, header.source_type, header.invoice_date, header.due_date,
    line_total, header.tax_amount, header.tax_rate, line_total + header.tax_amount, 0,
    line_total + header.tax_amount, 'draft', false, header.payment_terms, header.notes,
    header.billed_from_proposal, jsonb_array_length(p_change_orders) > 0, auth.uid(), header.created_by_name
  ) RETURNING id INTO draft_id;

  INSERT INTO public.invoice_line_items (
    invoice_id, description, quantity, unit_price, amount, item_type, is_taxable,
    tax_amount, tax_classification_id, sort_order
  )
  SELECT draft_id, line.description, line.quantity, line.unit_price, line.amount,
    line.item_type, line.is_taxable, line.tax_amount, line.tax_classification_id, line.sort_order
  FROM jsonb_populate_recordset(NULL::public.invoice_line_items, p_lines) AS line;

  INSERT INTO public.invoice_change_order_links (
    company_id, invoice_id, change_order_id, amount_billed, fully_billed
  )
  SELECT header.company_id, draft_id, link.change_order_id, link.amount_billed, false
  FROM jsonb_populate_recordset(NULL::public.invoice_change_order_links, p_change_orders) AS link;

  RETURN draft_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_progress_invoice_draft(jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_progress_invoice_draft(jsonb,jsonb,jsonb) TO authenticated;
