-- Prevent edits to committed source lines while the parent change order is locked.
-- Approved unlock/relock will be permitted to edit only after an explicit, authorized unlock.
CREATE OR REPLACE FUNCTION public.guard_locked_change_order_line_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE
 v_id uuid; v_status text; v_locked boolean;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN v_id:=NEW.change_order_id;
 ELSIF TG_OP='DELETE' THEN v_id:=OLD.change_order_id;
 ELSE
   IF NEW.change_order_id IS DISTINCT FROM OLD.change_order_id THEN
     RAISE EXCEPTION 'Moving change-order lines between orders is not supported';
   END IF;
   v_id:=NEW.change_order_id;
 END IF;
 SELECT status,is_locked INTO v_status,v_locked FROM public.change_orders WHERE id=v_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parent change order not found'; END IF;
 IF v_locked IS TRUE OR v_status IN ('approved','completed','rejected') THEN
   RAISE EXCEPTION 'Cannot modify lines of a locked or finalized change order; use the authorized revision workflow';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_locked_change_order_line_mutation ON public.change_order_line_items;
CREATE TRIGGER trg_guard_locked_change_order_line_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_line_items
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_change_order_line_mutation();
