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
    po.document_type <> 'po' OR po.status IN ('cancelled','canceled','void') OR
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
     WHERE proposal_line_item_id=NEW.proposal_line_item_id AND sales_order_id=NEW.sales_order_id AND id<>NEW.id)+NEW.quantity>proposal_line.quantity THEN
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

-- Direct catalog ordering and consolidated vendor orders can explicitly allocate
-- a PO item across multiple sales orders. Never infer by SKU.
-- Caller must have purchasing permission; allocation validation trigger verifies
-- tenant, originating proposal, product identity and both quantity ceilings.
CREATE OR REPLACE FUNCTION public.assign_po_line_allocations(
 p_po_item_id uuid, p_allocations jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id(); target record; allocation jsonb;
BEGIN
 IF NOT public.can_manage_purchasing() OR org IS NULL THEN
  RAISE EXCEPTION 'Purchasing permission required';
 END IF;
 IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_allocations)=0 THEN
  RAISE EXCEPTION 'Select at least one allocation';
 END IF;
 SELECT i.id,i.organization_id,i.product_id,o.document_type,o.status
 INTO target FROM public.po_items i
 JOIN public.purchase_orders o ON o.id=i.po_id
 WHERE i.id=p_po_item_id AND i.organization_id=org AND o.organization_id=org
 FOR UPDATE OF i;
 IF NOT FOUND OR target.document_type <> 'po' OR target.status <> 'draft' THEN
  RAISE EXCEPTION 'Only draft purchase orders can be allocated';
 END IF;
 IF EXISTS(SELECT 1 FROM public.po_line_allocations WHERE po_item_id=p_po_item_id) THEN
  RAISE EXCEPTION 'PO line already allocated; edit existing allocations through an audited workflow';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_allocations) x
  WHERE nullif(x->>'sales_order_id','') IS NULL
     OR nullif(x->>'proposal_line_item_id','') IS NULL
     OR nullif(x->>'quantity','') IS NULL) THEN
  RAISE EXCEPTION 'Missing required allocation fields';
 END IF;
 FOR allocation IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
  INSERT INTO public.po_line_allocations
    (organization_id,po_item_id,sales_order_id,proposal_line_item_id,product_id,quantity)
  VALUES(org,p_po_item_id,(allocation->>'sales_order_id')::uuid,
    (allocation->>'proposal_line_item_id')::uuid,target.product_id,
    (allocation->>'quantity')::numeric);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assign_po_line_allocations(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_po_line_allocations(uuid,jsonb) TO authenticated;

-- One tenant-scoped source of outstanding job demand for both purchasing screens.
-- Draft PO allocations reserve demand, so it cannot be ordered twice while a
-- consolidated vendor PO is being assembled. Cancelled POs release demand.
CREATE OR REPLACE FUNCTION public.get_unallocated_sales_order_products()
RETURNS TABLE(
 sales_order_id uuid, proposal_line_item_id uuid, product_id uuid,
 required_quantity numeric, po_allocated_quantity numeric,
 remaining_quantity numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id();
BEGIN
 IF org IS NULL OR NOT public.can_manage_purchasing() THEN
  RAISE EXCEPTION 'Purchasing permission required';
 END IF;
 RETURN QUERY
 SELECT so.id, li.id, li.product_id, li.quantity::numeric,
        coalesce(sum(a.quantity) FILTER (WHERE po.status NOT IN ('cancelled','canceled','void')),0)::numeric,
        (li.quantity-coalesce(sum(a.quantity) FILTER
          (WHERE po.status NOT IN ('cancelled','canceled','void')),0))::numeric
 FROM public.sales_orders so
 JOIN public.proposal_line_items li ON li.proposal_id=so.proposal_id
 LEFT JOIN public.po_line_allocations a
   ON a.proposal_line_item_id=li.id AND a.sales_order_id=so.id
   AND a.organization_id=org
 LEFT JOIN public.po_items poi ON poi.id=a.po_item_id AND poi.organization_id=org
 LEFT JOIN public.purchase_orders po ON po.id=poi.po_id AND po.organization_id=org
 WHERE so.organization_id=org AND li.organization_id=org
   AND li.product_id IS NOT NULL AND li.quantity>0
   AND so.status NOT IN ('complete','closed')
 GROUP BY so.id,li.id,li.product_id,li.quantity
 HAVING li.quantity>coalesce(sum(a.quantity) FILTER
   (WHERE po.status NOT IN ('cancelled','canceled','void')),0);
END $$;
REVOKE ALL ON FUNCTION public.get_unallocated_sales_order_products() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_unallocated_sales_order_products() TO authenticated;

-- Do not allow an existing allocated PO line to silently change product,
-- owning PO, or tenant. A new PO line must be created and explicitly allocated.
CREATE OR REPLACE FUNCTION public.protect_allocated_po_line_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.po_line_allocations WHERE po_item_id=OLD.id)
 AND (NEW.product_id IS DISTINCT FROM OLD.product_id
   OR NEW.po_id IS DISTINCT FROM OLD.po_id
   OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
  RAISE EXCEPTION 'Cannot change product, PO, or tenant of allocated equipment';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_allocated_po_line_identity_write
 BEFORE UPDATE OF product_id,po_id,organization_id ON public.po_items
 FOR EACH ROW EXECUTE FUNCTION public.protect_allocated_po_line_identity();

-- Prevent shrinking a source equipment line below quantities already
-- reserved/ordered, so later proposal edits cannot corrupt the ledger.
CREATE OR REPLACE FUNCTION public.protect_allocated_sales_order_line_quantity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.quantity < (SELECT coalesce(max(total_qty),0) FROM
   (SELECT sum(a.quantity) AS total_qty FROM public.po_line_allocations a
    JOIN public.po_items i ON i.id=a.po_item_id
    JOIN public.purchase_orders p ON p.id=i.po_id
    WHERE a.proposal_line_item_id=OLD.id
      AND p.status NOT IN ('cancelled','canceled','void')
    GROUP BY a.sales_order_id) grouped) THEN
  RAISE EXCEPTION 'Cannot reduce sales order equipment below allocated quantity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_allocated_sales_order_line_quantity_write
 BEFORE UPDATE OF quantity ON public.proposal_line_items
 FOR EACH ROW EXECUTE FUNCTION public.protect_allocated_sales_order_line_quantity();

-- A deleted PO line must not erase the job's purchasing history. Cancel the
-- parent PO to release demand, or use an explicit audited reversal instead.
CREATE OR REPLACE FUNCTION public.prevent_allocated_po_line_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.po_line_allocations WHERE po_item_id=OLD.id) THEN
  RAISE EXCEPTION 'Cannot delete allocated PO equipment; cancel the purchase order or reverse allocations explicitly';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER prevent_allocated_po_line_delete_write
 BEFORE DELETE ON public.po_items
 FOR EACH ROW EXECUTE FUNCTION public.prevent_allocated_po_line_delete();

-- Changing the sales-order line product would invalidate every linked PO
-- allocation even when the requested quantity remains unchanged.
CREATE OR REPLACE FUNCTION public.prevent_allocated_source_product_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.product_id IS DISTINCT FROM OLD.product_id AND EXISTS
  (SELECT 1 FROM public.po_line_allocations WHERE proposal_line_item_id=OLD.id) THEN
  RAISE EXCEPTION 'Cannot change product on an allocated sales order equipment line';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_allocated_source_product_change_write
 BEFORE UPDATE OF product_id ON public.proposal_line_items
 FOR EACH ROW EXECUTE FUNCTION public.prevent_allocated_source_product_change();
