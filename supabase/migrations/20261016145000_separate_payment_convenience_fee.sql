-- Preserve gross processor charge while accounting for invoice principal separately.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS convenience_fee_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_convenience_fee_valid
  CHECK (convenience_fee_amount >= 0 AND convenience_fee_amount <= amount);

CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 v_invoice_id uuid;
 v_total numeric;
 v_paid numeric;
BEGIN
 IF TG_OP = 'DELETE' THEN
   v_invoice_id := OLD.invoice_id;
 ELSE
   v_invoice_id := NEW.invoice_id;
 END IF;
 SELECT COALESCE(SUM(amount - convenience_fee_amount),0) INTO v_paid
 FROM public.payments WHERE invoice_id = v_invoice_id;
 SELECT total INTO v_total FROM public.invoices WHERE id = v_invoice_id;
 IF v_total IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
 UPDATE public.invoices SET
  amount_paid = v_paid,
  amount_due = v_total - v_paid,
  status = CASE
   WHEN v_paid = 0 THEN 'submitted'
   WHEN v_paid >= v_total THEN 'paid'
   WHEN v_paid > 0 AND v_paid < v_total THEN 'partial'
   ELSE status END,
  updated_at = now()
 WHERE id = v_invoice_id;
 RETURN COALESCE(NEW,OLD);
END;
$$;
