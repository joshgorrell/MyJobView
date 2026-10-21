-- Reverse previously posted invoice sales credit when an invoice is voided.
-- Immutable compensating entries preserve original attribution and audit history.
-- Refunds/credit memos need their own verified source linkage; never infer them
-- from payment status or customer reassignment.
CREATE OR REPLACE FUNCTION public.reverse_voided_invoice_sales_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_credit record;
BEGIN
  IF NEW.status NOT IN ('void','voided','cancelled')
     OR (TG_OP='UPDATE' AND OLD.status IN ('void','voided','cancelled')) THEN
    RETURN NEW;
  END IF;
  FOR v_credit IN
    SELECT c.* FROM public.sales_performance_credits c
    WHERE c.organization_id=NEW.organization_id
      AND c.source_id=NEW.id
      AND c.source_type IN ('service_invoice','retail_invoice','recurring_invoice')
      AND c.net_amount>0
  LOOP
    INSERT INTO public.sales_performance_credits
      (organization_id,credited_rep_id,customer_id,source_type,source_id,
       source_event_key,effective_at,net_amount,attribution_reason)
    VALUES
      (v_credit.organization_id,v_credit.credited_rep_id,v_credit.customer_id,
       'adjustment',NEW.id,'invoice:void:'||v_credit.id::text,
       now(),-v_credit.net_amount,'void_reversal_of:'||v_credit.source_event_key)
    ON CONFLICT (organization_id,source_event_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reverse_voided_invoice_sales_credit() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS reverse_voided_invoice_sales_credit ON public.invoices;
CREATE TRIGGER reverse_voided_invoice_sales_credit
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.reverse_voided_invoice_sales_credit();
