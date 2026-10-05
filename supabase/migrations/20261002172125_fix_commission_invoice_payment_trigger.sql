-- The shared legacy payment trigger reads NEW.invoice_id, which invoices do not have.
-- Invoice balance updates need an invoice-specific trigger; payment-side tracking remains intact.
CREATE FUNCTION private.security_invoice_commission_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE percentage_collected numeric;
BEGIN
 IF NEW.total IS NULL OR NEW.total<=0 THEN RETURN NEW; END IF;
 percentage_collected:=least(coalesce(NEW.amount_paid,0)/NEW.total,1.0);
 UPDATE public.commission_records SET
  amount_collected=coalesce(NEW.amount_paid,0),
  amount_earned=total_potential_commission*percentage_collected,
  status=CASE WHEN coalesce(NEW.amount_paid,0)=0 THEN 'pending' WHEN NEW.amount_paid>=NEW.total THEN 'ready_to_pay' ELSE 'accruing' END,
  updated_at=now()
 WHERE invoice_id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_invoice_commission_update() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER trigger_update_commission_on_invoice_update ON public.invoices;
CREATE TRIGGER trigger_update_commission_on_invoice_update AFTER UPDATE ON public.invoices
 FOR EACH ROW WHEN (OLD.amount_paid IS DISTINCT FROM NEW.amount_paid OR OLD.total IS DISTINCT FROM NEW.total)
 EXECUTE FUNCTION private.security_invoice_commission_update();
