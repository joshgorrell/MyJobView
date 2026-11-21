-- Historical purchasing contract: once a PO has been issued, vendor catalog
-- refreshes and other automated writes cannot rewrite its ordered prices.
-- Draft POs remain editable by authorized purchasing staff.
CREATE OR REPLACE FUNCTION public.prevent_issued_po_price_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE parent_status text;
DECLARE parent_type text;
BEGIN
  IF NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price
     AND NEW.total_price IS NOT DISTINCT FROM OLD.total_price THEN
    RETURN NEW;
  END IF;

  SELECT status, document_type INTO parent_status, parent_type
  FROM public.purchase_orders WHERE id = OLD.po_id;

  IF parent_type = 'po' AND parent_status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Issued purchase order prices are historical snapshots; record actual vendor cost separately'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_issued_po_price_rewrite ON public.po_items;
CREATE TRIGGER prevent_issued_po_price_rewrite
BEFORE UPDATE OF unit_price, total_price ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_po_price_rewrite();

REVOKE ALL ON FUNCTION public.prevent_issued_po_price_rewrite() FROM PUBLIC, anon, authenticated;
