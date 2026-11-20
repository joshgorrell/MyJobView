-- Publish the verified draft through the existing work-order checks and queue updates.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'public.save_work_order_invoice(uuid,uuid[],jsonb,jsonb,boolean,boolean,uuid)'::regprocedure
  );
  line_check constant text := ' IF jsonb_typeof(p_lines) IS DISTINCT FROM ''array''';
  queue_update constant text := ' UPDATE public.service_billing_queue SET status=''invoice_created''';
BEGIN
  IF strpos(definition, line_check) = 0 OR strpos(definition, queue_update) = 0 THEN
    RAISE EXCEPTION 'Unexpected work-order invoice save function';
  END IF;

  definition := replace(definition, line_check, $body$
 IF p_publish AND p_lines IS NULL THEN
  SELECT * INTO existing FROM public.invoices
    WHERE id=p_invoice_id AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR existing.status IS DISTINCT FROM 'draft'
    OR existing.contact_id IS DISTINCT FROM customer
    OR existing.work_order_billing_request_id IS NULL
    OR ids IS DISTINCT FROM (
      SELECT array_agg(work_order_id ORDER BY work_order_id)
      FROM public.work_order_invoice_links
      WHERE invoice_id=p_invoice_id AND organization_id=org
    ) THEN
    RAISE EXCEPTION 'Publish requires the saved draft and all of its linked work orders';
  END IF;
  inv := p_invoice_id;
 ELSE
  IF p_publish THEN
    RAISE EXCEPTION 'Save and verify the work-order invoice draft before submitting';
  END IF;
$body$ || line_check);
  EXECUTE replace(definition, queue_update, ' END IF;' || chr(10) || queue_update);

  definition := pg_get_functiondef('public.check_manual_invoice_tax_verification()'::regprocedure);
  IF strpos(definition, 'IF NOT NEW.manual_tax_verification_required OR') = 0 THEN
    RAISE EXCEPTION 'Expected invoice tax verification guard';
  END IF;
  EXECUTE replace(definition, 'IF NOT NEW.manual_tax_verification_required OR',
    'IF (NOT NEW.manual_tax_verification_required AND OLD.work_order_billing_request_id IS NULL) OR');
END;
$migration$;
