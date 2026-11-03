/*
# Require an authorized caller for submit_invoice

1. Problem
   - `submit_invoice(p_invoice_id uuid)` is SECURITY DEFINER and EXECUTE was granted to
     the `anon` role, while the body performed no caller check. Anyone who knew a draft
     invoice id could finalize it, burn an invoice number and make it customer visible.

2. Changes
   - Adds a guard requiring a signed-in caller whose organization matches the invoice.
   - Revokes EXECUTE from PUBLIC and `anon`, granting it to `authenticated` and
     `service_role` only.

3. Notes
   1. Only signed-in invoice screens call this routine, so the legitimate flow is
      unaffected.
   2. The validation and tax logic is unchanged.
*/

CREATE OR REPLACE FUNCTION public.submit_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_invoice RECORD;
v_line_items RECORD;
v_calc_result jsonb;
v_tax_amount numeric;
v_subtotal numeric;
v_total numeric;
v_portal_enabled boolean;
v_portal_visible boolean;
v_errors text[] := ARRAY[]::text[];
v_taxable_subtotal numeric;
v_assigned_number text;
BEGIN
IF auth.uid() IS NULL THEN
RETURN jsonb_build_object('success', false, 'errors', ARRAY['Not authorized']);
END IF;

SELECT * INTO v_invoice
FROM invoices
WHERE id = p_invoice_id
FOR UPDATE;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice not found']);
END IF;

IF v_invoice.organization_id IS DISTINCT FROM get_user_org_id() THEN
RETURN jsonb_build_object('success', false, 'errors', ARRAY['Not authorized']);
END IF;

IF v_invoice.status <> 'draft' THEN
RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice must be in draft status to submit']);
END IF;

IF v_invoice.contact_id IS NULL THEN
v_errors := array_append(v_errors, 'Customer is required');
END IF;

IF v_invoice.invoice_date IS NULL THEN
v_errors := array_append(v_errors, 'Invoice date is required');
END IF;
IF v_invoice.due_date IS NULL THEN
v_errors := array_append(v_errors, 'Due date is required');
END IF;

IF NOT EXISTS (SELECT 1 FROM invoice_line_items WHERE invoice_id = p_invoice_id) THEN
v_errors := array_append(v_errors, 'At least one line item is required');
ELSE
FOR v_line_items IN
SELECT description, amount, quantity, tax_classification_id, item_type
FROM invoice_line_items WHERE invoice_id = p_invoice_id
LOOP
IF v_line_items.description IS NULL OR v_line_items.description = '' THEN
v_errors := array_append(v_errors, 'All line items must have a description');
END IF;
IF v_line_items.quantity <= 0 THEN
v_errors := array_append(v_errors, 'Line item ''' || COALESCE(v_line_items.description, 'unnamed') || ''' must have a positive quantity');
END IF;
END LOOP;
END IF;

IF array_length(v_errors, 1) IS NOT NULL THEN
RETURN jsonb_build_object('success', false, 'errors', to_jsonb(v_errors));
END IF;

BEGIN
v_calc_result := calculate_tax_context('invoice', p_invoice_id);
v_tax_amount := COALESCE((v_calc_result->>'tax_amount')::numeric, 0);
v_taxable_subtotal := COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0);
EXCEPTION WHEN OTHERS THEN
v_tax_amount := 0;
v_taxable_subtotal := 0;
END;

IF v_calc_result->>'tax_calculation_status' = 'review_required' AND v_taxable_subtotal > 0 THEN
RETURN jsonb_build_object(
'success', false,
'errors', ARRAY['Tax calculation requires review. Please resolve tax configuration before submitting this invoice.']
);
END IF;

SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
FROM invoice_line_items WHERE invoice_id = p_invoice_id;

v_total := v_subtotal + v_tax_amount;

SELECT COALESCE(portal_invoices_enabled, false) INTO v_portal_enabled
FROM company_settings
WHERE organization_id = v_invoice.organization_id
LIMIT 1;

IF v_total - COALESCE(v_invoice.amount_paid, 0) > 0 AND v_portal_enabled THEN
v_portal_visible := true;
ELSE
v_portal_visible := false;
END IF;

UPDATE invoices
SET
status = 'submitted',
subtotal = v_subtotal,
tax_amount = v_tax_amount,
total = v_total,
amount_due = v_total - COALESCE(amount_paid, 0),
portal_visible = v_portal_visible,
tax_calculation_status = COALESCE(v_calc_result->>'tax_calculation_status', 'ready'),
tax_review_required = (v_calc_result->>'tax_calculation_status' = 'review_required'),
updated_at = now()
WHERE id = p_invoice_id;

SELECT invoice_number INTO v_assigned_number FROM invoices WHERE id = p_invoice_id;

RETURN jsonb_build_object(
'success', true,
'invoice_number', v_assigned_number,
'portal_visible', v_portal_visible
);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid) TO authenticated, service_role;