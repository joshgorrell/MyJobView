-- Close paths around the issued-PO price lock: reparenting lines, changing
-- ordered quantity, deleting historical lines, or reopening an issued PO.
CREATE OR REPLACE FUNCTION public.prevent_issued_po_line_rewrite()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE parent_status text;
DECLARE parent_type text;
BEGIN
  SELECT status, document_type INTO parent_status, parent_type
  FROM public.purchase_orders WHERE id = OLD.po_id;
  IF parent_type = 'po' AND parent_status NOT IN ('draft') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Issued purchase order lines cannot be deleted'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.po_id IS DISTINCT FROM OLD.po_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.total_price IS DISTINCT FROM OLD.total_price THEN
      RAISE EXCEPTION 'Issued purchase order lines are historical snapshots'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND
      (NEW.po_id IS DISTINCT FROM OLD.po_id OR
       NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Purchase order lines cannot be moved between orders or tenants'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_issued_po_price_rewrite ON public.po_items;
DROP TRIGGER IF EXISTS prevent_issued_po_line_rewrite ON public.po_items;
CREATE TRIGGER prevent_issued_po_line_rewrite
BEFORE UPDATE OR DELETE ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_po_line_rewrite();
REVOKE ALL ON FUNCTION public.prevent_issued_po_line_rewrite() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_issued_po_reopen()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF OLD.document_type = 'po'
     AND OLD.status NOT IN ('draft')
     AND (NEW.status = 'draft' OR NEW.document_type IS DISTINCT FROM OLD.document_type) THEN
    RAISE EXCEPTION 'Issued purchase orders cannot be reopened as drafts'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_issued_po_reopen ON public.purchase_orders;
CREATE TRIGGER prevent_issued_po_reopen
BEFORE UPDATE OF status, document_type ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_po_reopen();
REVOKE ALL ON FUNCTION public.prevent_issued_po_reopen() FROM PUBLIC, anon, authenticated;
