-- Retain the originating equipment line when Sales Order Product Manager
-- creates a parts request, even if the same SKU appears in multiple rooms.
ALTER TABLE public.product_request_items
 ADD COLUMN IF NOT EXISTS proposal_line_item_id uuid REFERENCES public.proposal_line_items(id);

-- A single vendor PO line can fulfill demand from multiple sales orders.
-- Allocation is explicit; product-name matching is never authoritative.
CREATE TABLE IF NOT EXISTS public.po_line_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 po_item_id uuid NOT NULL REFERENCES public.po_items(id),
 sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
 proposal_line_item_id uuid NOT NULL REFERENCES public.proposal_line_items(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric NOT NULL CHECK(quantity > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(po_item_id,proposal_line_item_id)
);
CREATE INDEX IF NOT EXISTS po_line_allocations_job_idx
 ON public.po_line_allocations(organization_id,sales_order_id);
ALTER TABLE public.po_line_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.po_line_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.po_line_allocations TO service_role;
-- Enforce tenant and document/line identity for every write, including service-role writes.
CREATE OR REPLACE FUNCTION public.validate_po_line_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE po record;
DECLARE so record;
DECLARE proposal_line record;
BEGIN
 -- Serialize allocations competing for either the same PO item or the same demand line.
 PERFORM 1 FROM public.po_items WHERE id=NEW.po_item_id FOR UPDATE;
 PERFORM 1 FROM public.proposal_line_items WHERE id=NEW.proposal_line_item_id FOR UPDATE;
 SELECT i.organization_id,i.product_id,i.quantity,o.document_type,o.status
 INTO po FROM public.po_items i JOIN public.purchase_orders o ON o.id=i.po_id
 WHERE i.id=NEW.po_item_id AND o.organization_id=NEW.organization_id;
 SELECT id,organization_id,proposal_id INTO so FROM public.sales_orders
 WHERE id=NEW.sales_order_id AND organization_id=NEW.organization_id;
 SELECT id,proposal_id,product_id,quantity INTO proposal_line
 FROM public.proposal_line_items WHERE id=NEW.proposal_line_item_id;
 IF po IS NULL OR so IS NULL OR proposal_line IS NULL OR
    po.document_type <> 'po' OR po.status='cancelled' OR
    po.organization_id <> NEW.organization_id OR
    so.proposal_id IS DISTINCT FROM proposal_line.proposal_id OR
    po.product_id IS DISTINCT FROM NEW.product_id OR
    proposal_line.product_id IS DISTINCT FROM NEW.product_id THEN
  RAISE EXCEPTION 'Invalid tenant, PO, or sales order line allocation';
 END IF;
 IF (SELECT coalesce(sum(quantity),0) FROM public.po_line_allocations
     WHERE po_item_id=NEW.po_item_id AND id<>NEW.id)+NEW.quantity>po.quantity THEN
  RAISE EXCEPTION 'PO line quantity over-allocated';
 END IF;
 IF (SELECT coalesce(sum(quantity),0) FROM public.po_line_allocations
     WHERE proposal_line_item_id=NEW.proposal_line_item_id AND id<>NEW.id)+NEW.quantity>proposal_line.quantity THEN
  RAISE EXCEPTION 'Sales order line quantity over-allocated';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_po_line_allocation_write
 BEFORE INSERT OR UPDATE ON public.po_line_allocations
 FOR EACH ROW EXECUTE FUNCTION public.validate_po_line_allocation();

-- Prevent reducing ordered quantity beneath already allocated units.
CREATE OR REPLACE FUNCTION public.prevent_po_allocation_overrun()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.quantity < (SELECT coalesce(sum(a.quantity),0)
    FROM public.po_line_allocations a WHERE a.po_item_id=NEW.id) THEN
  RAISE EXCEPTION 'Cannot reduce PO quantity below allocated quantity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_po_allocation_overrun_write
 BEFORE UPDATE OF quantity ON public.po_items
 FOR EACH ROW EXECUTE FUNCTION public.prevent_po_allocation_overrun();

-- Both the Sales Order and Global Product Manager ultimately use PO items.
-- Auto-allocate request-backed PO lines at creation, preserving original
-- sales-order-line identity rather than attempting to infer by SKU.
CREATE OR REPLACE FUNCTION public.allocate_request_backed_po_line()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_line record;
DECLARE parent_request record;
DECLARE parent_order record;
BEGIN
 IF NEW.product_request_item_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO parent_order FROM public.purchase_orders
 WHERE id=NEW.po_id AND organization_id=NEW.organization_id;
 IF parent_order.document_type <> 'po' THEN RETURN NEW; END IF;
 SELECT * INTO request_line FROM public.product_request_items
 WHERE id=NEW.product_request_item_id AND organization_id=NEW.organization_id;
 IF request_line.proposal_line_item_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO parent_request FROM public.product_requests
 WHERE id=request_line.request_id AND organization_id=NEW.organization_id;
 IF parent_request.sales_order_id IS NULL THEN RETURN NEW; END IF;
 IF request_line.product_id IS DISTINCT FROM NEW.product_id OR
    request_line.quantity_requested IS DISTINCT FROM NEW.quantity THEN
  RAISE EXCEPTION 'PO request line product or quantity does not match source';
 END IF;
 INSERT INTO public.po_line_allocations
 (organization_id,po_item_id,sales_order_id,proposal_line_item_id,product_id,quantity)
 VALUES(NEW.organization_id,NEW.id,parent_request.sales_order_id,
        request_line.proposal_line_item_id,NEW.product_id,NEW.quantity);
 RETURN NEW;
END $$;
CREATE TRIGGER allocate_request_backed_po_line_insert
 AFTER INSERT ON public.po_items
 FOR EACH ROW EXECUTE FUNCTION public.allocate_request_backed_po_line();
