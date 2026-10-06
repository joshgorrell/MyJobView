-- Purchasing access is a user permission, not a request approval workflow.
CREATE OR REPLACE FUNCTION public.can_manage_purchasing() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=public.get_user_org_id() AND (role='admin' OR can_create_purchase_orders));
$$;
REVOKE ALL ON FUNCTION public.can_manage_purchasing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_purchasing() TO authenticated;
ALTER TABLE public.purchase_orders ADD COLUMN document_type text NOT NULL DEFAULT 'po' CHECK(document_type IN('po','rfq'));
ALTER TABLE public.purchase_orders ADD COLUMN source_quote_id uuid REFERENCES public.purchase_orders(id);
CREATE UNIQUE INDEX purchase_order_quote_once ON public.purchase_orders(source_quote_id) WHERE source_quote_id IS NOT NULL;
ALTER TABLE public.po_items ADD COLUMN job_reference text;
ALTER TABLE public.po_items ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id);
ALTER TABLE public.po_items ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.po_items ADD COLUMN sales_order_id uuid REFERENCES public.sales_orders(id);
ALTER TABLE public.po_items ADD COLUMN service_request_id uuid REFERENCES public.service_requests(id);
CREATE TABLE public.purchase_quote_vendors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 quote_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE, vendor_id uuid NOT NULL REFERENCES public.vendors(id),
 unit_prices jsonb NOT NULL DEFAULT '{}', shipping_cost numeric NOT NULL DEFAULT 0 CHECK(shipping_cost>=0), tax_amount numeric NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 lead_time text, availability text, notes text, quoted_at timestamptz, sent_at timestamptz, UNIQUE(quote_id,vendor_id)
);
ALTER TABLE public.purchase_quote_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchasing_quote_access ON public.purchase_quote_vendors FOR ALL TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing()) WITH CHECK(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.purchase_quote_vendors TO authenticated;
GRANT ALL ON public.purchase_quote_vendors TO service_role;
CREATE POLICY purchasing_po_boundary ON public.purchase_orders AS RESTRICTIVE FOR ALL TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing()) WITH CHECK(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());
CREATE POLICY purchasing_line_boundary ON public.po_items AS RESTRICTIVE FOR ALL TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing()) WITH CHECK(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());

-- An atomic builder snapshots one line per original request item. Never aggregate by SKU.
CREATE FUNCTION public.create_request_purchase_document(p_items jsonb,p_vendor_ids uuid[],p_warehouse_id uuid,p_quote boolean,p_header jsonb,p_retry uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id(); doc uuid; item record; payload jsonb; vendor_name text; n int; v_subtotal numeric:=0; unit numeric; office public.company_offices;
BEGIN
 IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required'; END IF;
 IF p_retry IS NULL OR jsonb_array_length(p_items)=0 OR cardinality(p_vendor_ids)=0 OR (NOT p_quote AND cardinality(p_vendor_ids)<>1) THEN RAISE EXCEPTION 'Select items and vendors'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_retry::text,0));
 SELECT id INTO doc FROM public.purchase_orders WHERE id=p_retry AND organization_id=org;
 IF FOUND THEN RETURN doc; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND organization_id=org) THEN RAISE EXCEPTION 'Invalid warehouse'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_vendor_ids) v WHERE NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=v AND organization_id=org)) THEN RAISE EXCEPTION 'Invalid vendor'; END IF;
 SELECT v.vendor_name INTO vendor_name FROM public.vendors v WHERE v.id=p_vendor_ids[1];
 SELECT * INTO office FROM public.company_offices WHERE id=(p_header->>'office_id')::uuid AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a billing and shipping office'; END IF;
 IF nullif(p_header->>'ship_to_office_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_offices WHERE id=(p_header->>'ship_to_office_id')::uuid AND organization_id=org) THEN RAISE EXCEPTION 'Invalid shipping office'; END IF;
 IF nullif(p_header->>'ship_to_contact_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=(p_header->>'ship_to_contact_id')::uuid AND organization_id=org) THEN RAISE EXCEPTION 'Invalid shipping customer'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_items) x WHERE x->>'id' IS NOT NULL)<>(SELECT count(*) FROM jsonb_array_elements(p_items) x WHERE x->>'id' IS NOT NULL) THEN RAISE EXCEPTION 'Duplicate request items'; END IF;
 PERFORM i.id FROM public.product_request_items i WHERE i.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY i.id FOR UPDATE;
 INSERT INTO public.purchase_orders(id,organization_id,vendor_id,warehouse_id,document_type,status,created_by,order_date,expected_date,internal_note,external_note,bill_to_office_id,ship_to_office_id,bill_to_name,bill_to_address,bill_to_city,bill_to_state,bill_to_zip,ship_to_name,ship_to_address,ship_to_city,ship_to_state,ship_to_zip)
 VALUES(p_retry,org,p_vendor_ids[1],p_warehouse_id,CASE WHEN p_quote THEN 'rfq' ELSE 'po' END,'draft',auth.uid(),coalesce(nullif(p_header->>'order_date','')::date,current_date),nullif(p_header->>'expected_date','')::date,p_header->>'internal_note',p_header->>'external_note',office.id,office.id,office.office_name,office.address_line1,office.city,office.state,office.zip,office.office_name,office.address_line1,office.city,office.state,office.zip) RETURNING id INTO doc;
 FOR payload IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  IF payload->>'id' IS NULL THEN
   unit:=coalesce((payload->>'unit_price')::numeric,0);
   n:=(payload->>'quantity')::integer;
   IF n IS NULL OR n<=0 OR unit<0 OR nullif(btrim(payload->>'product_name'),'') IS NULL OR (nullif(payload->>'product_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=(payload->>'product_id')::uuid AND organization_id=org)) THEN RAISE EXCEPTION 'Invalid catalog line'; END IF;
   INSERT INTO public.po_items(po_id,organization_id,product_id,product_name,model_number,vendor,quantity,unit_price,total_price,job_reference) VALUES(doc,org,nullif(payload->>'product_id','')::uuid,payload->>'product_name',payload->>'model_number',vendor_name,n,unit,round(unit*n,2),coalesce(nullif(payload->>'job_reference',''),'Stock'));
   v_subtotal:=v_subtotal+round(unit*n,2);
   CONTINUE;
  END IF;
  SELECT i.*,r.work_order_id AS parent_wo,r.project_id AS parent_project,r.sales_order_id AS parent_so,r.service_request_id AS parent_sr,r.status AS request_status INTO item FROM public.product_request_items i JOIN public.product_requests r ON r.id=i.request_id WHERE i.id=(payload->>'id')::uuid AND i.organization_id=org AND r.organization_id=org;
  IF NOT FOUND OR item.purchase_order_id IS NOT NULL OR item.request_status='rejected' OR EXISTS(SELECT 1 FROM public.po_items l JOIN public.purchase_orders p ON p.id=l.po_id WHERE l.product_request_item_id=item.id AND p.document_type='po' AND p.status<>'cancelled') THEN RAISE EXCEPTION 'A request item is unavailable or already on a PO'; END IF;
  IF NOT p_quote AND lower(btrim(coalesce(item.vendor,'')))<>lower(btrim(vendor_name)) THEN RAISE EXCEPTION 'Combine only requests for the selected vendor'; END IF;
  unit:=coalesce((payload->>'unit_price')::numeric,0);
  IF unit<0 OR item.quantity_requested<=0 THEN RAISE EXCEPTION 'Invalid quantity or price'; END IF;
  INSERT INTO public.po_items(po_id,organization_id,product_id,product_name,model_number,vendor,quantity,unit_price,total_price,product_request_item_id,job_reference,work_order_id,project_id,sales_order_id,service_request_id)
  VALUES(doc,org,item.product_id,item.product_name,item.model_number,vendor_name,item.quantity_requested,unit,round(unit*item.quantity_requested,2),item.id,left(payload->>'job_reference',250),coalesce(item.work_order_id,item.parent_wo),coalesce(item.project_id,item.parent_project),coalesce(item.sales_order_id,item.parent_so),coalesce(item.service_request_id,item.parent_sr));
  v_subtotal:=v_subtotal+round(unit*item.quantity_requested,2);
  IF NOT p_quote THEN UPDATE public.product_request_items SET purchase_order_id=doc,ordered_quantity=item.quantity_requested,ordered_status='po_created' WHERE id=item.id; END IF;
 END LOOP;
 IF coalesce((p_header->>'shipping_cost')::numeric,0)<0 OR coalesce((p_header->>'tax_amount')::numeric,0)<0 THEN RAISE EXCEPTION 'Shipping and tax cannot be negative'; END IF;
 UPDATE public.purchase_orders SET subtotal=v_subtotal,shipping_cost=coalesce((p_header->>'shipping_cost')::numeric,0),tax_amount=coalesce((p_header->>'tax_amount')::numeric,0),total=v_subtotal+coalesce((p_header->>'shipping_cost')::numeric,0)+coalesce((p_header->>'tax_amount')::numeric,0),
 ship_to_office_id=CASE WHEN p_header ? 'ship_to_office_id' THEN (p_header->>'ship_to_office_id')::uuid ELSE ship_to_office_id END,ship_to_contact_id=(p_header->>'ship_to_contact_id')::uuid,
 ship_to_name=coalesce(p_header->>'ship_to_name',ship_to_name),ship_to_address=coalesce(p_header->>'ship_to_address',ship_to_address),ship_to_city=coalesce(p_header->>'ship_to_city',ship_to_city),ship_to_state=coalesce(p_header->>'ship_to_state',ship_to_state),ship_to_zip=coalesce(p_header->>'ship_to_zip',ship_to_zip) WHERE id=doc;
 IF NOT p_quote THEN UPDATE public.product_requests r SET status='po_created' WHERE EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=doc) AND NOT EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id IS NULL); END IF;
 IF p_quote THEN INSERT INTO public.purchase_quote_vendors(organization_id,quote_id,vendor_id) SELECT org,doc,v FROM unnest(p_vendor_ids) v ON CONFLICT DO NOTHING; END IF;
 RETURN doc;
END $$;
REVOKE ALL ON FUNCTION public.create_request_purchase_document(jsonb,uuid[],uuid,boolean,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_request_purchase_document(jsonb,uuid[],uuid,boolean,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.convert_purchase_quote(p_quote_id uuid,p_vendor_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id(); quote public.purchase_orders; bid public.purchase_quote_vendors; line public.po_items; doc uuid; price numeric; v_subtotal numeric:=0; vname text;
BEGIN
 IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required'; END IF;
 SELECT * INTO quote FROM public.purchase_orders WHERE id=p_quote_id AND organization_id=org AND document_type='rfq' AND status<>'cancelled' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quote request not found'; END IF;
 SELECT id INTO doc FROM public.purchase_orders WHERE source_quote_id=p_quote_id;
 IF FOUND THEN RETURN doc; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.po_items WHERE po_id=quote.id) THEN RAISE EXCEPTION 'Quote request has no lines'; END IF;
 SELECT * INTO bid FROM public.purchase_quote_vendors WHERE quote_id=p_quote_id AND vendor_id=p_vendor_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR bid.quoted_at IS NULL THEN RAISE EXCEPTION 'Record a complete vendor quote first'; END IF;
 SELECT vendor_name INTO vname FROM public.vendors WHERE id=p_vendor_id AND organization_id=org;
 PERFORM i.id FROM public.product_request_items i JOIN public.po_items l ON l.product_request_item_id=i.id WHERE l.po_id=quote.id ORDER BY i.id FOR UPDATE OF i;
 IF EXISTS(SELECT 1 FROM public.po_items l JOIN public.product_request_items i ON i.id=l.product_request_item_id WHERE l.po_id=quote.id AND (i.purchase_order_id IS NOT NULL OR i.quantity_requested<>l.quantity)) THEN RAISE EXCEPTION 'A request changed or is already on a PO'; END IF;
 INSERT INTO public.purchase_orders(organization_id,vendor_id,warehouse_id,source_quote_id,status,created_by,order_date,expected_date,shipping_cost,tax_amount,bill_to_office_id,ship_to_office_id,ship_to_contact_id,bill_to_name,bill_to_address,bill_to_city,bill_to_state,bill_to_zip,ship_to_name,ship_to_address,ship_to_city,ship_to_state,ship_to_zip,internal_note,external_note)
 VALUES(org,p_vendor_id,quote.warehouse_id,quote.id,'draft',auth.uid(),current_date,quote.expected_date,bid.shipping_cost,bid.tax_amount,quote.bill_to_office_id,quote.ship_to_office_id,quote.ship_to_contact_id,quote.bill_to_name,quote.bill_to_address,quote.bill_to_city,quote.bill_to_state,quote.bill_to_zip,quote.ship_to_name,quote.ship_to_address,quote.ship_to_city,quote.ship_to_state,quote.ship_to_zip,quote.internal_note,quote.external_note) RETURNING id INTO doc;
 FOR line IN SELECT * FROM public.po_items WHERE po_id=quote.id ORDER BY created_at,id LOOP
  price:=(bid.unit_prices->>line.id::text)::numeric;
  IF price IS NULL OR price<0 THEN RAISE EXCEPTION 'Every line needs a vendor price'; END IF;
  INSERT INTO public.po_items(po_id,organization_id,product_id,product_name,model_number,vendor,quantity,unit_price,total_price,product_request_item_id,job_reference,work_order_id,project_id,sales_order_id,service_request_id)
  VALUES(doc,org,line.product_id,line.product_name,line.model_number,vname,line.quantity,price,round(price*line.quantity,2),line.product_request_item_id,line.job_reference,line.work_order_id,line.project_id,line.sales_order_id,line.service_request_id);
  v_subtotal:=v_subtotal+round(price*line.quantity,2);
  UPDATE public.product_request_items SET purchase_order_id=doc,ordered_status='po_created',ordered_quantity=line.quantity WHERE id=line.product_request_item_id;
 END LOOP;
 UPDATE public.purchase_orders SET subtotal=v_subtotal,total=v_subtotal+bid.shipping_cost+bid.tax_amount WHERE id=doc;
 UPDATE public.product_requests r SET status='po_created' WHERE EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=doc) AND NOT EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id IS NULL);
 RETURN doc;
END $$;
REVOKE ALL ON FUNCTION public.convert_purchase_quote(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_purchase_quote(uuid,uuid) TO authenticated;

-- Only issued POs become ordered demand. Removing a draft releases its sources.
CREATE FUNCTION private.purchase_document_source_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.product_requests r SET status='pending' WHERE status<>'rejected' AND EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=OLD.id);
  UPDATE public.product_request_items SET purchase_order_id=null,ordered_status=null,ordered_quantity=null WHERE purchase_order_id=OLD.id;
  RETURN OLD;
 END IF;
 IF NEW.document_type='po' AND NEW.status IN('submitted','sent') AND OLD.status='draft' THEN
  UPDATE public.product_request_items SET ordered_status='ordered' WHERE purchase_order_id=NEW.id;
  UPDATE public.product_requests r SET status='ordered' WHERE EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND coalesce(i.ordered_status,'') NOT IN('ordered','received'));
 ELSIF NEW.status='cancelled' THEN
  UPDATE public.product_requests r SET status='pending' WHERE status<>'rejected' AND EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=NEW.id);
  UPDATE public.product_request_items SET purchase_order_id=null,ordered_status=null,ordered_quantity=null WHERE purchase_order_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.purchase_document_source_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER purchase_document_status AFTER UPDATE OF status ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION private.purchase_document_source_status();
CREATE TRIGGER purchase_document_delete BEFORE DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION private.purchase_document_source_status();
CREATE POLICY purchasing_request_read ON public.product_requests FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());
CREATE POLICY purchasing_request_item_read ON public.product_request_items FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());
CREATE POLICY purchasing_po_draft_delete ON public.purchase_orders AS RESTRICTIVE FOR DELETE TO authenticated USING(status='draft');

CREATE FUNCTION public.receive_purchase_document(p_po_id uuid,p_lines jsonb,p_retry uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id(); po public.purchase_orders; line public.po_items; payload jsonb; qty numeric; previous numeric; receipt uuid;
BEGIN
 IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required'; END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_po_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR po.document_type<>'po' OR po.status NOT IN('submitted','sent','partial','received') THEN RAISE EXCEPTION 'Only issued purchase orders can be received'; END IF;
 IF p_retry IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Enter quantities to receive'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_receipt_batches WHERE id=p_retry AND organization_id=org AND po_id=po.id) THEN RETURN; END IF;
 INSERT INTO public.purchase_receipt_batches(id,organization_id,po_id,created_by) VALUES(p_retry,org,po.id,auth.uid());
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Duplicate receipt lines'; END IF;
 FOR payload IN SELECT * FROM jsonb_array_elements(p_lines) ORDER BY (value->>'id') LOOP
  SELECT * INTO line FROM public.po_items WHERE id=(payload->>'id')::uuid AND po_id=po.id AND organization_id=org FOR UPDATE;
  qty:=(payload->>'quantity')::numeric;
  IF NOT FOUND OR qty IS NULL OR qty<=0 OR qty<>trunc(qty) OR coalesce(line.quantity_received,0)+qty>line.quantity THEN RAISE EXCEPTION 'Invalid receipt quantity for the job line'; END IF;
  UPDATE public.po_items SET quantity_received=coalesce(quantity_received,0)+qty,received_at=now() WHERE id=line.id;
  INSERT INTO public.purchase_receipt_lines(batch_id,po_item_id,quantity) VALUES(p_retry,line.id,qty);
  IF line.product_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(line.product_id::text||po.warehouse_id::text,0));
   SELECT quantity_on_hand INTO previous FROM public.product_inventory WHERE product_id=line.product_id AND warehouse_id=po.warehouse_id FOR UPDATE;
   previous:=coalesce(previous,0);
   INSERT INTO public.product_inventory(organization_id,product_id,warehouse_id,quantity_on_hand,quantity_reserved) VALUES(org,line.product_id,po.warehouse_id,qty,0)
   ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity_on_hand=public.product_inventory.quantity_on_hand+qty;
   INSERT INTO public.stock_movements(organization_id,product_id,warehouse_id,movement_type,quantity,quantity_before,quantity_after,reference_type,reference_id,notes,created_by) VALUES(org,line.product_id,po.warehouse_id,'purchase',qty,previous,previous+qty,'purchase_order',po.id,coalesce(line.job_reference,'Stock')||' · '||po.po_number,auth.uid());
  END IF;
  UPDATE public.product_request_items SET ordered_status=CASE WHEN coalesce(line.quantity_received,0)+qty>=line.quantity THEN 'received' ELSE 'ordered' END WHERE id=line.product_request_item_id;
 END LOOP;
 UPDATE public.purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.po_items WHERE po_id=po.id AND quantity_received<quantity) THEN 'partial' ELSE 'received' END,received_date=CASE WHEN NOT EXISTS(SELECT 1 FROM public.po_items WHERE po_id=po.id AND quantity_received<quantity) THEN current_date ELSE null END WHERE id=po.id;
 UPDATE public.product_requests r SET status='received' WHERE EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND i.purchase_order_id=po.id) AND NOT EXISTS(SELECT 1 FROM public.product_request_items i WHERE i.request_id=r.id AND coalesce(i.ordered_status,'')<>'received');
END $$;
REVOKE ALL ON FUNCTION public.receive_purchase_document(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_document(uuid,jsonb,uuid) TO authenticated;
CREATE TABLE public.purchase_receipt_batches(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations,po_id uuid NOT NULL REFERENCES public.purchase_orders,created_by uuid REFERENCES public.profiles,created_at timestamptz DEFAULT now());
CREATE TABLE public.purchase_receipt_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES public.purchase_receipt_batches,po_item_id uuid NOT NULL REFERENCES public.po_items,quantity integer NOT NULL CHECK(quantity>0));
ALTER TABLE public.purchase_receipt_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_receipt_read ON public.purchase_receipt_batches FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_manage_purchasing());
CREATE POLICY purchase_receipt_line_read ON public.purchase_receipt_lines FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.purchase_receipt_batches WHERE id=batch_id));
GRANT SELECT ON public.purchase_receipt_batches,public.purchase_receipt_lines TO authenticated;
GRANT ALL ON public.purchase_receipt_batches,public.purchase_receipt_lines TO service_role;
CREATE FUNCTION private.validate_purchase_document_tenant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=NEW.vendor_id AND organization_id=NEW.organization_id) OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=NEW.warehouse_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Purchasing vendor and warehouse must belong to this organization'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_purchase_document_tenant() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER validate_purchase_document_tenant BEFORE INSERT OR UPDATE OF vendor_id,warehouse_id,organization_id ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION private.validate_purchase_document_tenant();
CREATE POLICY purchasing_line_parent ON public.po_items AS RESTRICTIVE FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=po_id AND organization_id=po_items.organization_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=po_id AND organization_id=po_items.organization_id));
CREATE FUNCTION private.validate_purchase_bid() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=NEW.quote_id AND organization_id=NEW.organization_id AND document_type='rfq') OR NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=NEW.vendor_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Invalid quote vendor'; END IF;
 IF jsonb_typeof(NEW.unit_prices)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each_text(NEW.unit_prices) p WHERE NOT EXISTS(SELECT 1 FROM public.po_items WHERE id::text=p.key AND po_id=NEW.quote_id) OR p.value::numeric<0) THEN RAISE EXCEPTION 'Invalid quoted prices'; END IF;
 IF NEW.quoted_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.po_items WHERE po_id=NEW.quote_id AND (NEW.unit_prices->>id::text IS NULL OR (NEW.unit_prices->>id::text)::numeric<0)) THEN RAISE EXCEPTION 'Quote every job line'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_purchase_bid() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER validate_purchase_bid BEFORE INSERT OR UPDATE ON public.purchase_quote_vendors FOR EACH ROW EXECUTE FUNCTION private.validate_purchase_bid();
