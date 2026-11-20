ALTER TABLE public.invoices
  ADD COLUMN manual_tax_verification_required boolean NOT NULL DEFAULT false;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.create_manual_invoice_atomic(jsonb,jsonb,boolean)'::regprocedure);
BEGIN
  IF strpos(definition, 'jobsite_state, jobsite_zip, created_by') = 0
    OR strpos(definition, 'jobsite_state, jobsite_zip, auth.uid()') = 0 THEN
    RAISE EXCEPTION 'Unexpected manual invoice insert definition';
  END IF;
  definition := replace(definition, 'jobsite_state, jobsite_zip, created_by',
    'jobsite_state, jobsite_zip, created_by, manual_tax_verification_required');
  definition := replace(definition, 'jobsite_state, jobsite_zip, auth.uid()',
    'jobsite_state, jobsite_zip, auth.uid(), true');
  EXECUTE definition;
END;
$migration$;

REVOKE EXECUTE ON FUNCTION public.persist_taxjar_result(text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_taxjar_result(text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.check_manual_invoice_tax_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  context jsonb;
BEGIN
  IF OLD.manual_tax_verification_required AND NOT NEW.manual_tax_verification_required THEN
    RAISE EXCEPTION 'Manual invoice tax verification cannot be disabled.';
  END IF;

  IF NOT NEW.manual_tax_verification_required OR OLD.status IS DISTINCT FROM 'draft'
     OR NEW.status IS NULL OR NEW.status NOT IN ('submitted', 'paid', 'partial', 'overdue') THEN
    RETURN NEW;
  END IF;

  IF public.calculate_tax_context('invoice', OLD.id)->>'tax_calculation_status' IN ('exempt', 'not_collecting')
     AND NEW.tax_amount = 0 THEN
    RETURN NEW;
  END IF;

  context := public.calculate_tax('invoice', OLD.id);
  IF context->>'tax_calculation_status' = 'ready'
    AND NEW.tax_calculation_status = 'ready'
    AND EXISTS (
      SELECT 1
      FROM public.tax_snapshots AS quote
      WHERE quote.transaction_type = 'invoice'
        AND quote.transaction_id = OLD.id
        AND quote.organization_id = OLD.organization_id
        AND quote.tax_calculation_status = 'ready'
        AND quote.taxjar_verified_at BETWEEN statement_timestamp() - interval '15 minutes' AND statement_timestamp()
        AND quote.sales_tax = NEW.tax_amount
        AND quote.combined_rate = NEW.tax_rate
        AND quote.taxable_subtotal = (context->>'taxable_subtotal')::numeric
        AND quote.origin_address IS NOT DISTINCT FROM context->'origin_result'
        AND quote.destination_address IS NOT DISTINCT FROM context->'destination_result'
        AND quote.taxability_results IS NOT DISTINCT FROM context->'taxability_results'
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Verify sales tax for the current invoice before submitting. Reopen the draft and retry Submit.';
END;
$function$;

REVOKE ALL ON FUNCTION public.check_manual_invoice_tax_verification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zz_check_manual_invoice_tax_verification
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.check_manual_invoice_tax_verification();
