-- Automatically synchronize approved removals, without touching contract amounts.
-- A failed validation aborts approval atomically rather than leaving visible removed items.
CREATE OR REPLACE FUNCTION public.sync_approved_change_order_removals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_proposal uuid;
 v_total integer;
 v_valid integer;
 v_distinct_targets integer;
 v_changed integer;
BEGIN
 IF NEW.status IS DISTINCT FROM 'approved' OR NEW.is_locked IS DISTINCT FROM true THEN
   RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD.is_locked IS NOT DISTINCT FROM NEW.is_locked THEN
   RETURN NEW;
 END IF;
 SELECT proposal_id INTO v_proposal FROM public.sales_orders
 WHERE id=NEW.sales_order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF NOT FOUND OR v_proposal IS NULL THEN
   RAISE EXCEPTION 'Approved change order requires a valid Sales Order proposal';
 END IF;
 SELECT count(*),count(DISTINCT proposal_line_item_id)
 INTO v_total,v_distinct_targets
 FROM public.change_order_line_items
 WHERE change_order_id=NEW.id AND action_type='remove';
 IF v_total=0 THEN RETURN NEW; END IF;
 IF v_total<>v_distinct_targets THEN
   RAISE EXCEPTION 'Duplicate or missing removal target on change order %',NEW.id;
 END IF;
 PERFORM 1 FROM public.proposal_line_items pli
 WHERE pli.id IN (
   SELECT proposal_line_item_id FROM public.change_order_line_items
   WHERE change_order_id=NEW.id AND action_type='remove'
 ) FOR UPDATE;
 SELECT count(*) INTO v_valid
 FROM public.change_order_line_items cli
 JOIN public.proposal_line_items pli ON pli.id=cli.proposal_line_item_id
 WHERE cli.change_order_id=NEW.id AND cli.organization_id=NEW.organization_id
 AND cli.action_type='remove'
 AND pli.organization_id=NEW.organization_id AND pli.proposal_id=v_proposal
 AND cli.original_quantity IS NOT NULL AND cli.original_unit_price IS NOT NULL
 AND pli.quantity=cli.original_quantity AND pli.unit_price=cli.original_unit_price;
 IF v_valid<>v_total THEN
   RAISE EXCEPTION 'Change order % removal validation failed (% of % targets verified)',NEW.id,v_valid,v_total;
 END IF;
 UPDATE public.proposal_line_items pli SET is_hidden=true,updated_at=now()
 FROM public.change_order_line_items cli
 WHERE cli.change_order_id=NEW.id AND cli.organization_id=NEW.organization_id
 AND cli.action_type='remove' AND cli.proposal_line_item_id=pli.id
 AND pli.organization_id=NEW.organization_id AND pli.proposal_id=v_proposal
 AND pli.is_hidden IS DISTINCT FROM true;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_approved_change_order_removals ON public.change_orders;
CREATE TRIGGER trg_sync_approved_change_order_removals
 AFTER INSERT OR UPDATE OF status,is_locked ON public.change_orders
 FOR EACH ROW EXECUTE FUNCTION public.sync_approved_change_order_removals();
REVOKE ALL ON FUNCTION public.sync_approved_change_order_removals() FROM PUBLIC,anon,authenticated;
