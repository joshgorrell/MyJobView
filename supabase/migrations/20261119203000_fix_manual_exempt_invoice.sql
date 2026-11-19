-- Finalized invoice exemptions require a recorded customer certificate.
CREATE FUNCTION public.invoice_exemption_certificate(
  p_contact_id uuid, p_organization_id uuid, p_state text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT cert.certificate_number
  FROM public.tax_exemption_certificates AS cert
  JOIN public.contacts AS contact ON contact.id = cert.contact_id
    AND contact.organization_id = cert.organization_id
  WHERE contact.id = p_contact_id
    AND contact.organization_id = p_organization_id
    AND contact.is_tax_exempt
    AND cert.is_active
    AND cert.issue_date <= CURRENT_DATE
    AND upper(trim(cert.issuing_state)) = upper(trim(p_state))
    AND (cert.expiration_date IS NULL OR cert.expiration_date >= CURRENT_DATE)
    AND lower(trim(cert.certificate_number)) NOT IN ('', 'pending review')
  ORDER BY cert.expiration_date DESC NULLS FIRST, cert.id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.invoice_exemption_certificate(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.calculate_tax_context(text,uuid)'::regprocedure);
  old_branch text := 'IF v_contact_id IS NOT NULL THEN
SELECT exemption_reference INTO v_exemption_ref';
BEGIN
  IF position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected calculate_tax_context exemption branch';
  END IF;
  EXECUTE replace(definition, old_branch, 'IF p_transaction_type = ''invoice'' THEN
v_exemption_ref := public.invoice_exemption_certificate(v_contact_id, v_org_id, v_state);
v_is_exempt := v_exemption_ref IS NOT NULL;
ELSIF v_contact_id IS NOT NULL THEN
SELECT exemption_reference INTO v_exemption_ref');

  definition := pg_get_functiondef('public.calculate_tax_context(text,uuid)'::regprocedure);
  old_branch := 'IF v_is_exempt THEN
v_tax_amount := 0;';
  IF position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected calculate_tax_context amount branch';
  END IF;
  EXECUTE replace(definition, old_branch, 'IF v_is_exempt THEN
IF p_transaction_type = ''invoice'' THEN v_taxable_subtotal := 0; END IF;
v_tax_amount := 0;');

  definition := pg_get_functiondef('public.calculate_tax_context(text,uuid)'::regprocedure);
  old_branch := 'IF array_length(v_review_reasons, 1) IS NOT NULL THEN
v_tax_calculation_status := ''review_required'';';
  IF position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected calculate_tax_context status branch';
  END IF;
  EXECUTE replace(definition, old_branch, 'IF p_transaction_type = ''invoice'' AND v_is_exempt THEN
v_tax_calculation_status := ''exempt'';
ELSIF array_length(v_review_reasons, 1) IS NOT NULL THEN
v_tax_calculation_status := ''review_required'';');
END;
$migration$;

CREATE FUNCTION public.require_invoice_exemption_certificate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF (NEW.tax_project_type = 'exempt_project' OR NEW.tax_calculation_status = 'exempt')
     AND public.invoice_exemption_certificate(
       NEW.contact_id, NEW.organization_id, NEW.jobsite_state
     ) IS NULL THEN
    RAISE EXCEPTION 'An active sales tax exemption certificate for the transaction state is required. Add it in Customer Details before submitting.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.require_invoice_exemption_certificate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_require_invoice_exemption_certificate
BEFORE INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW WHEN (NEW.status IN ('submitted', 'paid', 'partial', 'overdue'))
EXECUTE FUNCTION public.require_invoice_exemption_certificate();

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
