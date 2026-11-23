-- Keep the stored draft total consistent with TaxJar before document generation.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.persist_taxjar_result(text,uuid,jsonb)'::regprocedure);
  success_anchor constant text := E'    UPDATE proposals SET\n      tax_amount = v_amount_to_collect,';
  failure_anchor constant text := $body$    UPDATE proposals SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = 0
    WHERE id = p_transaction_id;$body$;
BEGIN
  IF strpos(definition, success_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected TaxJar proposal write';
  END IF;
  EXECUTE replace(definition, success_anchor, $body$    UPDATE proposals SET
      total = CASE WHEN status = 'draft'
        THEN total - coalesce(tax_amount, 0) + v_amount_to_collect ELSE total END,
      deposit_amount_due = CASE WHEN status = 'draft' THEN coalesce((
        SELECT CASE WHEN coalesce(settings.deposit_type, 'percentage') = 'percentage'
          THEN round((proposals.total - coalesce(proposals.tax_amount, 0) + v_amount_to_collect)
            * coalesce(settings.deposit_percent, 50) / 100, 2)
          ELSE proposals.deposit_amount_due END
        FROM public.proposal_settings AS settings
        WHERE settings.proposal_id = proposals.id
      ), deposit_amount_due) ELSE deposit_amount_due END,
      tax_amount = v_amount_to_collect,$body$);

  definition := pg_get_functiondef('public.mark_tax_review_required(text,uuid,text)'::regprocedure);
  IF strpos(definition, failure_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected TaxJar proposal failure write';
  END IF;
  EXECUTE replace(definition, failure_anchor, $body$    UPDATE proposals SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = CASE WHEN status = 'draft' THEN tax_amount ELSE 0 END
    WHERE id = p_transaction_id;$body$);
END;
$migration$;
