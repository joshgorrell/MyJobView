-- Sales performance only: full reversal when an authorized workflow voids a Sales Order.
-- This trigger DOES NOT move money or create customer credit. The admin workflow
-- must reconcile paid deposits into customer_account_credits before setting voided.
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('pending_deposit','pending_po','planning','active','complete','closed','voided'));

CREATE OR REPLACE FUNCTION public.reverse_voided_sales_order_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_credit record; v_org uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status='voided' THEN RETURN NEW; END IF;
  SELECT organization_id INTO v_org FROM public.contacts WHERE id=NEW.contact_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Cannot void order without customer organization'; END IF;
  -- Only an admin can void; service-role operations must be handled through
  -- the audited administrative workflow, not direct user edits.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND p.organization_id=v_org AND p.role='admin'
  ) THEN RAISE EXCEPTION 'Only an administrator may void a Sales Order'; END IF;
  -- Deposit receipt is not the same as credit transfer. Refuse to finalize a
  -- funded void until the separate accounting workflow has reconciled funds.
  IF EXISTS (
    SELECT 1 FROM public.proposals p WHERE p.id=NEW.proposal_id
      AND COALESCE(p.deposit_paid,false)=true
  ) AND NOT EXISTS (
    SELECT 1 FROM public.customer_account_credits c
    WHERE c.sales_order_id=NEW.id AND c.organization_id=v_org
      AND c.contact_id=NEW.contact_id AND c.status<>'voided'
      AND c.amount>0
  ) THEN
    RAISE EXCEPTION 'Deposit-funded Sales Order requires reconciled customer credit before void';
  END IF;
  FOR v_credit IN
    SELECT c.* FROM public.sales_performance_credits c
    WHERE c.organization_id=v_org AND c.source_type='sales_order'
      AND c.source_id=NEW.id AND c.net_amount>0
  LOOP
    INSERT INTO public.sales_performance_credits
      (organization_id,credited_rep_id,customer_id,source_type,source_id,
       source_event_key,effective_at,net_amount,attribution_reason)
    VALUES (v_org,v_credit.credited_rep_id,v_credit.customer_id,'adjustment',
      NEW.id,'sales_order:void:'||v_credit.id::text,now(),-v_credit.net_amount,
      'void_reversal_of:'||v_credit.source_event_key)
    ON CONFLICT (organization_id,source_event_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reverse_voided_sales_order_credit() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS reverse_voided_sales_order_credit ON public.sales_orders;
CREATE TRIGGER reverse_voided_sales_order_credit
AFTER UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.reverse_voided_sales_order_credit();
