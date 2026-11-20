-- Serialize TaxJar writes with invoice posting and keep draft amounts in sync.
DO $migration$
DECLARE
  routine regprocedure;
  definition text;
  invoice_lookup constant text :=
    'SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_transaction_id;';
  review_update constant text := $body$    UPDATE invoices SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = 0
    WHERE id = p_transaction_id;$body$;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.persist_taxjar_result(text,uuid,jsonb)'::regprocedure,
    'public.mark_tax_review_required(text,uuid,text)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    IF strpos(definition, invoice_lookup) = 0 THEN
      RAISE EXCEPTION 'Unexpected invoice lookup in %', routine;
    END IF;

    definition := replace(definition, invoice_lookup, $body$
    SELECT organization_id INTO v_org_id
    FROM invoices
    WHERE id = p_transaction_id AND status = 'draft'
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Only draft invoices can be recalculated.');
    END IF;$body$);

    IF routine = 'public.persist_taxjar_result(text,uuid,jsonb)'::regprocedure THEN
      IF strpos(definition, E'    UPDATE invoices SET\n      tax_amount = v_amount_to_collect,') = 0 THEN
        RAISE EXCEPTION 'Unexpected invoice tax update in %', routine;
      END IF;
      definition := replace(
        definition,
        E'    UPDATE invoices SET\n      tax_amount = v_amount_to_collect,',
        $body$    UPDATE invoices SET
      total = total - COALESCE(tax_amount, 0) + v_amount_to_collect,
      amount_due = amount_due - COALESCE(tax_amount, 0) + v_amount_to_collect,
      tax_amount = v_amount_to_collect,$body$
      );
    ELSE
      IF strpos(definition, review_update) = 0 THEN
        RAISE EXCEPTION 'Unexpected invoice review update in %', routine;
      END IF;
      definition := replace(definition, review_update, $body$    UPDATE invoices SET
      tax_calculation_status = 'review_required',
      tax_review_required = true
    WHERE id = p_transaction_id;$body$);
    END IF;

    EXECUTE definition;
  END LOOP;
END;
$migration$;
