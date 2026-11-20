-- Compare the inputs sent to TaxJar after taking the existing invoice row lock.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.persist_taxjar_result(text,uuid,jsonb)'::regprocedure);
  anchor constant text := $body$      RETURN jsonb_build_object('error', 'Only draft invoices can be recalculated.');
    END IF;$body$;
BEGIN
  IF strpos(definition, anchor) = 0 THEN
    RAISE EXCEPTION 'Expected the TaxJar draft invoice lock before binding verification inputs';
  END IF;
  definition := replace(definition, anchor, anchor || $body$
    v_calc_result := public.calculate_tax('invoice', p_transaction_id);
    IF v_calc_result->>'tax_calculation_status' IS DISTINCT FROM 'ready'
      OR p_taxjar_result->'invoice_tax_inputs' IS DISTINCT FROM jsonb_build_array(
        v_calc_result->'tax_calculation_status',
        v_calc_result->'origin_result',
        v_calc_result->'destination_result',
        v_calc_result->'taxable_subtotal',
        v_calc_result->'taxability_results',
        v_calc_result->'collection_status',
        v_calc_result->'exemption_reference'
      ) THEN
      RETURN jsonb_build_object('error', 'Invoice tax details changed during verification. Retry Submit.');
    END IF;$body$);

  IF strpos(definition, 'v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);') = 0 THEN
    RAISE EXCEPTION 'Expected existing TaxJar snapshot context calculation';
  END IF;
  EXECUTE replace(definition,
    'v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);',
    $body$IF p_transaction_type <> 'invoice' THEN
    v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);
  END IF;$body$);
END;
$migration$;
