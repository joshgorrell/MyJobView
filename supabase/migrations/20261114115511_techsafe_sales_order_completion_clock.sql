-- Forward-only Sales Order completion history. Never backfill from field
-- Work Order completion, current status, creation time, or migration time.
ALTER TABLE public.sales_orders
 ADD COLUMN techsafe_completed_at timestamptz,
 ADD COLUMN techsafe_completion_history_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_orders ALTER COLUMN techsafe_completion_history_verified SET DEFAULT true;

CREATE OR REPLACE FUNCTION techsafe_source.capture_sales_order_completion_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.techsafe_completion_history_verified:=true;
  NEW.techsafe_completed_at:=CASE WHEN NEW.status IN ('complete','completed')
    THEN transaction_timestamp() ELSE NULL END;
 ELSE
  -- Callers cannot rewrite or clear the clock, including while reopening.
  NEW.techsafe_completion_history_verified:=OLD.techsafe_completion_history_verified;
  NEW.techsafe_completed_at:=OLD.techsafe_completed_at;
  IF OLD.techsafe_completion_history_verified AND OLD.techsafe_completed_at IS NULL
     AND NEW.status IN ('complete','completed')
     AND OLD.status NOT IN ('complete','completed') THEN
   NEW.techsafe_completed_at:=transaction_timestamp();
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.capture_sales_order_completion_clock() FROM PUBLIC;
CREATE TRIGGER techsafe_sales_order_completion_clock BEFORE INSERT OR UPDATE
 ON public.sales_orders FOR EACH ROW
 EXECUTE FUNCTION techsafe_source.capture_sales_order_completion_clock();
COMMENT ON COLUMN public.sales_orders.techsafe_completed_at IS
 'First observed native Sales Order completion; immutable through reopening. UTC calendar date is exported to Techsafe.';
COMMENT ON COLUMN public.sales_orders.techsafe_completion_history_verified IS
 'False for pre-migration orders: requires independent historical reconciliation before Techsafe export.';
