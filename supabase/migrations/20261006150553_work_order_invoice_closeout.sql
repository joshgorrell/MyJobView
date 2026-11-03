-- Finance and the technicians on a linked visit may review its job clocks.
CREATE POLICY linked_visit_job_time_read ON public.time_entries FOR SELECT TO authenticated USING (
 organization_id=public.get_user_org_id() AND work_order_id IS NOT NULL AND (
 public.can_view_all_org_invoices() OR EXISTS (
 SELECT 1 FROM public.work_orders w JOIN public.work_orders mine ON mine.organization_id=w.organization_id
 AND (mine.id=w.id OR (mine.work_order_group_id IS NOT NULL AND mine.work_order_group_id=w.work_order_group_id))
 WHERE w.id=time_entries.work_order_id AND mine.assigned_to=auth.uid())));
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS source_part_id uuid REFERENCES public.service_parts_used(id) ON DELETE CASCADE;
-- Billing is a snapshot of actual job clocks; payroll/source time is never edited.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS work_order_billing_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_work_order_retry ON public.invoices(organization_id,work_order_billing_request_id) WHERE work_order_billing_request_id IS NOT NULL;
CREATE TABLE public.work_order_invoice_links (
 work_order_id uuid PRIMARY KEY REFERENCES public.work_orders(id),
 invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actual_hours numeric NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_order_invoice_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_links_read ON public.work_order_invoice_links FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND public.can_view_all_org_invoices());
CREATE POLICY billing_links_insert ON public.work_order_invoice_links FOR INSERT TO authenticated WITH CHECK(organization_id=public.get_user_org_id() AND public.can_view_all_org_invoices()
 AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.id=work_order_id AND w.organization_id=work_order_invoice_links.organization_id)
 AND EXISTS(SELECT 1 FROM public.invoices i JOIN public.work_orders w ON w.id=work_order_id WHERE i.id=invoice_id AND i.organization_id=work_order_invoice_links.organization_id AND i.contact_id=w.contact_id AND i.status='draft'));
CREATE POLICY billing_links_update_hours ON public.work_order_invoice_links FOR UPDATE TO authenticated
 USING(organization_id=public.get_user_org_id() AND public.can_view_all_org_invoices() AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.status='draft' AND i.organization_id=work_order_invoice_links.organization_id))
 WITH CHECK(organization_id=public.get_user_org_id() AND public.can_view_all_org_invoices() AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.status='draft' AND i.organization_id=work_order_invoice_links.organization_id));
GRANT SELECT,INSERT ON public.work_order_invoice_links TO authenticated;
GRANT UPDATE(actual_hours) ON public.work_order_invoice_links TO authenticated;
GRANT ALL ON public.work_order_invoice_links TO service_role;

CREATE OR REPLACE FUNCTION public.save_work_order_invoice(p_request_id uuid,p_work_order_ids uuid[],p_header jsonb,p_lines jsonb,p_publish boolean DEFAULT false,p_portal boolean DEFAULT true,p_invoice_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE org uuid:=public.get_user_org_id(); ids uuid[]; customer uuid; inv uuid; line jsonb; header public.invoices; v_subtotal numeric; publish_result jsonb; existing public.invoices;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.can_view_all_org_invoices() THEN RAISE EXCEPTION 'Billing permission required'; END IF;
 IF p_request_id IS NULL OR coalesce(cardinality(p_work_order_ids),0)=0 THEN RAISE EXCEPTION 'Work orders and retry key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text||p_request_id::text,0));
 SELECT * INTO existing FROM public.invoices WHERE organization_id=org AND work_order_billing_request_id=p_request_id;
 IF FOUND AND p_invoice_id IS NULL THEN RETURN existing.id; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_work_order_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.id=id AND w.organization_id=org)) THEN RAISE EXCEPTION 'Invalid work order'; END IF;
 SELECT array_agg(w.id ORDER BY w.id) INTO ids FROM public.work_orders w WHERE w.organization_id=org AND (w.id=ANY(p_work_order_ids) OR w.work_order_group_id IN(SELECT work_order_group_id FROM public.work_orders WHERE id=ANY(p_work_order_ids) AND organization_id=org));
 PERFORM 1 FROM public.work_orders WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(DISTINCT contact_id) FROM public.work_orders WHERE id=ANY(ids))<>1 OR EXISTS(SELECT 1 FROM public.work_orders WHERE id=ANY(ids) AND contact_id IS NULL) THEN RAISE EXCEPTION 'Select work orders for one customer'; END IF;
 SELECT contact_id INTO customer FROM public.work_orders WHERE id=ids[1];
 IF EXISTS(SELECT 1 FROM public.work_orders WHERE id=ANY(ids) AND (type<>'service' OR NOT coalesce(is_billable,true) OR (p_publish AND status<>'completed'))) THEN RAISE EXCEPTION 'All linked service work orders must be completed and billable'; END IF;
 IF p_publish AND EXISTS(SELECT 1 FROM public.time_entries WHERE work_order_id=ANY(ids) AND clock_out IS NULL AND coalesce(status,'draft') NOT IN('rejected','cancelled')) THEN RAISE EXCEPTION 'Clock out all technicians before billing'; END IF;
 IF EXISTS(SELECT 1 FROM public.work_order_invoice_links WHERE work_order_id=ANY(ids) AND invoice_id IS DISTINCT FROM p_invoice_id)
 OR EXISTS(SELECT 1 FROM public.service_billing_queue WHERE work_order_id=ANY(ids) AND invoice_id IS NOT NULL AND invoice_id IS DISTINCT FROM p_invoice_id) THEN RAISE EXCEPTION 'A selected or linked work order is already invoiced'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Invoice lines required'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF nullif(btrim(line->>'description'),'') IS NULL OR coalesce((line->>'quantity')::numeric,0)<=0 OR coalesce((line->>'unit_price')::numeric,-1)<0 THEN RAISE EXCEPTION 'Valid description, positive quantity and nonnegative price required'; END IF;
  IF nullif(line->>'source_part_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.service_parts_used WHERE id=(line->>'source_part_id')::uuid AND work_order_id=ANY(ids)) THEN RAISE EXCEPTION 'Invalid source part'; END IF;
  IF nullif(line->>'product_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=(line->>'product_id')::uuid AND organization_id=org) THEN RAISE EXCEPTION 'Invalid catalog item'; END IF;
  IF line->>'item_type' IS NULL OR line->>'item_type' NOT IN('labor','material','design_fee','project_management','freight_delivery','credit_card_fee') THEN RAISE EXCEPTION 'Invalid line type'; END IF;
 END LOOP;
 SELECT sum(round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2)) INTO v_subtotal FROM jsonb_array_elements(p_lines);
 header:=jsonb_populate_record(NULL::public.invoices,p_header);
 IF p_invoice_id IS NOT NULL THEN
  SELECT * INTO existing FROM public.invoices WHERE id=p_invoice_id AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR existing.status<>'draft' OR existing.contact_id IS DISTINCT FROM customer THEN RAISE EXCEPTION 'Only this customer’s draft invoice can be reviewed'; END IF;
  IF EXISTS(SELECT 1 FROM public.work_order_invoice_links WHERE invoice_id=p_invoice_id AND NOT(work_order_id=ANY(ids))) THEN RAISE EXCEPTION 'Include every work order already linked to this draft'; END IF;
  inv:=p_invoice_id;
  DELETE FROM public.invoice_line_items WHERE invoice_id=inv;
  UPDATE public.invoices SET invoice_date=header.invoice_date,due_date=header.due_date,notes=header.notes,tax_environment=header.tax_environment,tax_project_type=header.tax_project_type,tax_rate=header.tax_rate,
   billing_name=header.billing_name,billing_address_line1=header.billing_address_line1,billing_address_line2=header.billing_address_line2,billing_city=header.billing_city,billing_state=header.billing_state,billing_zip=header.billing_zip,
   subtotal=v_subtotal,tax_amount=coalesce(header.tax_amount,0),total=v_subtotal+coalesce(header.tax_amount,0),amount_due=v_subtotal+coalesce(header.tax_amount,0)-coalesce(amount_paid,0) WHERE id=inv;
 ELSE
  INSERT INTO public.invoices(organization_id,company_id,contact_id,project_id,created_by,work_order_billing_request_id,invoice_date,due_date,status,subtotal,tax_amount,total,amount_paid,amount_due,notes,tax_environment,tax_project_type,tax_rate,payment_terms,billing_name,billing_address_line1,billing_address_line2,billing_city,billing_state,billing_zip)
  VALUES(org,org,customer,(SELECT project_id FROM public.work_orders WHERE id=ids[1]),auth.uid(),p_request_id,header.invoice_date,header.due_date,'draft',v_subtotal,coalesce(header.tax_amount,0),v_subtotal+coalesce(header.tax_amount,0),0,v_subtotal+coalesce(header.tax_amount,0),header.notes,header.tax_environment,header.tax_project_type,header.tax_rate,header.payment_terms,header.billing_name,header.billing_address_line1,header.billing_address_line2,header.billing_city,header.billing_state,header.billing_zip) RETURNING id INTO inv;
 END IF;
 INSERT INTO public.invoice_line_items(invoice_id,organization_id,description,quantity,unit_price,amount,item_type,is_taxable,product_id,sku,cost,notes,notes_visible_on_invoice,sort_order,source_part_id)
 SELECT inv,org,value->>'description',(value->>'quantity')::numeric,(value->>'unit_price')::numeric,round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2),value->>'item_type',coalesce((value->>'is_taxable')::boolean,true),nullif(value->>'product_id','')::uuid,value->>'sku',nullif(value->>'cost','')::numeric,value->>'notes',coalesce((value->>'notes_visible_on_invoice')::boolean,false),ordinality-1,nullif(value->>'source_part_id','')::uuid FROM jsonb_array_elements(p_lines) WITH ORDINALITY;
 INSERT INTO public.work_order_invoice_links(work_order_id,invoice_id,organization_id,actual_hours)
 SELECT w.id,inv,org,coalesce((SELECT sum(total_hours) FROM public.time_entries WHERE work_order_id=w.id AND clock_out IS NOT NULL AND coalesce(status,'draft') NOT IN('rejected','cancelled')),0) FROM public.work_orders w WHERE w.id=ANY(ids) ON CONFLICT(work_order_id) DO UPDATE SET actual_hours=EXCLUDED.actual_hours WHERE work_order_invoice_links.invoice_id=EXCLUDED.invoice_id;
 UPDATE public.service_billing_queue SET status='invoice_created',invoice_id=inv,invoiced_at=CASE WHEN p_publish THEN now() ELSE invoiced_at END WHERE work_order_id=ANY(ids);
 IF p_publish THEN
  IF p_portal AND NOT EXISTS(SELECT 1 FROM public.company_settings WHERE organization_id=org AND portal_invoices_enabled) THEN RAISE EXCEPTION 'Enable invoices in customer portal settings or submit with portal publication off'; END IF;
  publish_result:=public.submit_invoice(inv);
  IF NOT coalesce((publish_result->>'success')::boolean,false) THEN RAISE EXCEPTION '%',coalesce(publish_result->'errors','["Invoice submission failed"]'); END IF;
  UPDATE public.invoices SET portal_visible=p_portal WHERE id=inv;
  UPDATE public.service_billing_queue SET status='payment_pending' WHERE work_order_id=ANY(ids);
 END IF;
 RETURN inv;
END $$;
REVOKE ALL ON FUNCTION public.save_work_order_invoice(uuid,uuid[],jsonb,jsonb,boolean,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_work_order_invoice(uuid,uuid[],jsonb,jsonb,boolean,boolean,uuid) TO authenticated;

-- Completion enters the review queue once, including completed work orders predating this migration.
CREATE OR REPLACE FUNCTION private.queue_completed_service_visit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.service_requests;
BEGIN
 IF NEW.status='completed' AND NEW.type='service' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.service_billing_queue WHERE work_order_id=NEW.id) THEN
   SELECT * INTO request FROM public.service_requests WHERE work_order_id=NEW.id AND organization_id=NEW.organization_id LIMIT 1;
   INSERT INTO public.service_billing_queue(work_order_id,organization_id,contact_id,service_request_id,billable_by,assigned_to_user_id,completed_at,billing_deadline)
   VALUES(NEW.id,NEW.organization_id,NEW.contact_id,request.id,coalesce(request.billable_by,'dispatch'),request.billable_by_user_id,now(),now()+interval '2 days');
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.queue_completed_service_visit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_completed_service_visit AFTER INSERT OR UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION private.queue_completed_service_visit();
INSERT INTO public.service_billing_queue(work_order_id,organization_id,contact_id,billable_by,completed_at,billing_deadline)
 SELECT w.id,w.organization_id,w.contact_id,'dispatch',coalesce(w.actual_completion_date::timestamptz,now()),now()+interval '2 days' FROM public.work_orders w
 WHERE w.status='completed' AND w.type='service' AND NOT EXISTS(SELECT 1 FROM public.service_billing_queue q WHERE q.work_order_id=w.id);
