-- Keep the exempt-project choice consistent with the invoice preview and tax snapshot.
-- Customer-level exemptions continue through the certificate resolver.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.calculate_tax_context(text,uuid)'::regprocedure);
  old_branch text := 'IF v_is_exempt THEN
v_tax_amount := 0;';
BEGIN
  IF position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected calculate_tax_context definition';
  END IF;

  EXECUTE replace(definition, old_branch, 'IF p_transaction_type = ''invoice'' AND v_project_type = ''exempt_project'' THEN
v_is_exempt := true;
v_taxable_subtotal := 0;
v_tax_amount := 0;
ELSIF v_is_exempt THEN
v_tax_amount := 0;');

  definition := pg_get_functiondef('public.calculate_tax_context(text,uuid)'::regprocedure);
  old_branch := 'IF array_length(v_review_reasons, 1) IS NOT NULL THEN
v_tax_calculation_status := ''review_required'';';
  IF position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected calculate_tax_context status branch';
  END IF;

  EXECUTE replace(definition, old_branch, 'IF p_transaction_type = ''invoice'' AND v_project_type = ''exempt_project'' THEN
v_tax_calculation_status := ''exempt'';
ELSIF array_length(v_review_reasons, 1) IS NOT NULL THEN
v_tax_calculation_status := ''review_required'';');
END;
$migration$;

-- Use the same RLS as the existing writes. Roll back the header and lines when
-- a line fails validation or the requested submission is rejected.
CREATE FUNCTION public.create_manual_invoice_atomic(
  p_invoice jsonb,
  p_line_items jsonb,
  p_submit boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $function$
DECLARE
  new_invoice_id uuid;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to create an invoice.';
  END IF;
  IF jsonb_typeof(p_invoice) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_line_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid invoice data.';
  END IF;
  IF jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one invoice line item.';
  END IF;

  INSERT INTO public.invoices (
    company_id, contact_id, project_id, sales_order_id, invoice_date, due_date,
    status, customer_visible_on_submit, subtotal, tax_amount, total, amount_paid,
    amount_due, notes, tax_environment, tax_project_type, tax_rate, payment_terms,
    billing_name, billing_address_line1, billing_address_line2, billing_city,
    billing_state, billing_zip, bill_to_contact_id, jobsite_address, jobsite_city,
    jobsite_state, jobsite_zip, created_by
  )
  SELECT coalesce(company_id, public.get_user_org_id()),
    contact_id, project_id, sales_order_id, invoice_date, due_date,
    'draft', customer_visible_on_submit, subtotal, tax_amount, total, 0,
    total, notes, tax_environment, tax_project_type, tax_rate, payment_terms,
    billing_name, billing_address_line1, billing_address_line2, billing_city,
    billing_state, billing_zip, bill_to_contact_id, jobsite_address, jobsite_city,
    jobsite_state, jobsite_zip, auth.uid()
  FROM jsonb_populate_record(NULL::public.invoices, p_invoice)
  RETURNING id INTO new_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id, product_id, sku, description, quantity, unit_price, cost,
    amount, is_taxable, item_type, source_type, notes, notes_visible_on_invoice,
    tax_classification_id, sort_order
  )
  SELECT new_invoice_id, line.product_id, line.sku, line.description, line.quantity,
    line.unit_price, line.cost, line.amount, line.is_taxable, line.item_type,
    line.source_type, line.notes, line.notes_visible_on_invoice,
    line.tax_classification_id, line.sort_order
  FROM jsonb_populate_recordset(NULL::public.invoice_line_items, p_line_items) AS line;

  IF p_submit THEN
    result := public.submit_invoice(new_invoice_id);
    IF (result->>'success')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION '%', coalesce(
        (SELECT string_agg(message, ' ') FROM jsonb_array_elements_text(result->'errors') AS errors(message)),
        'Invoice submission failed.'
      );
    END IF;
  END IF;

  RETURN new_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_manual_invoice_atomic(jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_invoice_atomic(jsonb,jsonb,boolean) TO authenticated;
