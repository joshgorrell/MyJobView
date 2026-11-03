/*
# Require an authorized caller for void_invoice

1. Problem
   - `void_invoice(p_invoice_id uuid)` is SECURITY DEFINER and EXECUTE was granted to
     the `anon` role, while the body performed no caller check at all. Anyone who knew
     or guessed an invoice id could void that invoice in any organization.

2. Changes
   - Adds a guard requiring a signed-in caller whose organization matches the invoice.
   - Revokes EXECUTE from PUBLIC and `anon`, granting it to `authenticated` and
     `service_role` only.

3. Notes
   1. The application only calls this from the signed-in invoice screen, so the
      legitimate flow is unaffected.
   2. No data is modified or removed.
*/

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_invoice RECORD;
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

IF v_invoice.status NOT IN ('submitted', 'partial', 'paid', 'overdue') THEN
RETURN jsonb_build_object('success', false, 'errors', ARRAY['Only submitted, partial, paid, or overdue invoices can be voided']);
END IF;

UPDATE invoices
SET
status = 'void',
portal_visible = false,
qbo_void_pending = (v_invoice.qbo_invoice_id IS NOT NULL),
updated_at = now()
WHERE id = p_invoice_id;

RETURN jsonb_build_object(
'success', true,
'invoice_number', v_invoice.invoice_number,
'qbo_void_pending', v_invoice.qbo_invoice_id IS NOT NULL
);
END;
$function$;

REVOKE ALL ON FUNCTION public.void_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid) TO authenticated, service_role;