-- Require the existing tax verification for sales-order billing drafts.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.check_manual_invoice_tax_verification()'::regprocedure);
  scope_anchor constant text :=
    'IF (NOT NEW.manual_tax_verification_required AND OLD.work_order_billing_request_id IS NULL) OR';
  context_anchor constant text := '  IF public.calculate_tax_context(''invoice'', OLD.id)';
BEGIN
  IF strpos(definition, scope_anchor) = 0 OR strpos(definition, context_anchor) = 0 THEN
    RAISE EXCEPTION 'Unexpected invoice tax verification guard';
  END IF;

  definition := replace(definition, scope_anchor, $body$
  IF (NOT NEW.manual_tax_verification_required AND OLD.work_order_billing_request_id IS NULL
      AND NOT (OLD.sales_order_id IS NOT NULL
        AND COALESCE(OLD.source_type IN ('progress', 'final', 'manual'), false))) OR$body$);

  EXECUTE replace(definition, context_anchor, $body$
  IF OLD.sales_order_id IS NOT NULL AND OLD.source_type IN ('progress', 'final', 'manual')
     AND OLD.subtotal IS DISTINCT FROM (
       SELECT round(COALESCE(sum(amount), 0), 2)
       FROM public.invoice_line_items
       WHERE invoice_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'The invoice subtotal includes amounts without invoice lines. Add classified lines for all billed amounts before submitting.';
  END IF;

$body$ || context_anchor);
END;
$migration$;
