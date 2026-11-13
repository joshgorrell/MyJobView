-- Prospective native approval evidence only. Never backfill historical orders.
-- Capture after the native approval transaction has created its Sales Order.
-- No connection activation, source certificate or delivery permission is granted.
CREATE TABLE techsafe_source.native_approval_equipment_basis (
 sales_order_id uuid PRIMARY KEY REFERENCES public.sales_orders(id),
 organization_id uuid NOT NULL,
 proposal_id uuid NOT NULL,
 approved_at timestamptz NOT NULL,
 basis jsonb NOT NULL CHECK (jsonb_typeof(basis)='object'),
 basis_hash text NOT NULL CHECK (basis_hash ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE techsafe_source.native_approval_equipment_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_approval_equipment_basis FORCE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.native_approval_equipment_basis FROM PUBLIC,anon,authenticated,service_role;

-- Exact, bounded sold facts; no costs, margins, notes, personnel or catalog MSRP.
CREATE FUNCTION techsafe_source.current_approval_equipment_basis(p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH binding AS (
  SELECT so.id,so.organization_id,so.proposal_id,so.contact_id
  FROM public.sales_orders so JOIN public.proposals p
    ON p.id=so.proposal_id AND p.organization_id=so.organization_id
    AND p.sales_order_id=so.id AND p.contact_id=so.contact_id
  WHERE so.id=p_order AND p.status='approved'
    AND NOT EXISTS(SELECT 1 FROM public.proposal_line_items foreign_line
      WHERE foreign_line.proposal_id=p.id AND foreign_line.organization_id IS DISTINCT FROM so.organization_id)
 ), items AS MATERIALIZED (
  SELECT jsonb_build_object('id',li.id,'product_id',li.product_id,
    'description',li.description,'item_type',li.item_type,'quantity',li.quantity,
    'unit_price',li.unit_price,'line_total',li.line_total,'labor_total',li.labor_total,
    'is_customer_supplied',li.is_customer_supplied) AS body,li.id
  FROM public.proposal_line_items li JOIN binding b
    ON li.proposal_id=b.proposal_id AND li.organization_id=b.organization_id
  ORDER BY li.id LIMIT 10001
 ), content AS (
  SELECT jsonb_build_object('version',1,'salesOrderId',b.id,
    'organizationId',b.organization_id,'proposalId',b.proposal_id,'contactId',b.contact_id,
    'lines',COALESCE((SELECT jsonb_agg(i.body ORDER BY i.id) FROM items i),'[]'::jsonb)) AS body
  FROM binding b WHERE (SELECT count(*) FROM items)<=10000
 ) SELECT body FROM content WHERE octet_length(body::text)<=4194304;
$$;
REVOKE ALL ON FUNCTION techsafe_source.current_approval_equipment_basis(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.capture_native_approval_equipment_basis()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.sales_orders%ROWTYPE; v_proposal public.proposals%ROWTYPE;
 v_body jsonb; v_approved timestamptz;
BEGIN
 -- This function is installed only on the native draft -> approved transition.
 -- A deferred trigger observes the native transaction's final state, not an
 -- earlier partial state before Sales Order creation or source writes finish.
 SELECT * INTO v_proposal FROM public.proposals WHERE id=NEW.id;
 IF v_proposal.status IS DISTINCT FROM 'approved' THEN RETURN NULL; END IF;
 SELECT * INTO v_order FROM public.sales_orders
  WHERE id=v_proposal.sales_order_id AND proposal_id=v_proposal.id
    AND organization_id=v_proposal.organization_id AND contact_id=v_proposal.contact_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_approved:=COALESCE(v_proposal.approval_completed_at,v_proposal.approved_at);
 -- Both native creation and approval must belong to THIS transaction.
 -- Reopening/reapproving an older Sales Order cannot bless its mutable rows.
 IF v_order.created_at IS DISTINCT FROM transaction_timestamp()
    OR v_approved IS DISTINCT FROM transaction_timestamp()
    OR EXISTS(SELECT 1 FROM techsafe_source.native_approval_equipment_basis
      WHERE sales_order_id=v_order.id)
    OR EXISTS(SELECT 1 FROM public.change_orders
      WHERE sales_order_id=v_order.id AND organization_id=v_order.organization_id
        AND status IN ('approved','completed'))
 THEN RETURN NULL; END IF;
 v_body:=techsafe_source.current_approval_equipment_basis(v_order.id);
 IF v_body IS NULL THEN RETURN NULL; END IF;
 INSERT INTO techsafe_source.native_approval_equipment_basis
 (sales_order_id,organization_id,proposal_id,approved_at,basis,basis_hash)
 VALUES(v_order.id,v_order.organization_id,v_order.proposal_id,v_approved,v_body,
  encode(pg_catalog.sha256(pg_catalog.convert_to(v_body::text,'UTF8')),'hex'));
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.capture_native_approval_equipment_basis() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER techsafe_capture_native_approval_basis
 AFTER UPDATE OF status ON public.proposals DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM 'approved' AND NEW.status='approved' AND OLD.sales_order_id IS NULL)
 EXECUTE FUNCTION techsafe_source.capture_native_approval_equipment_basis();

CREATE FUNCTION techsafe_source.prevent_native_basis_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Native approval basis is immutable'; END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.prevent_native_basis_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_native_basis_immutable BEFORE UPDATE OR DELETE
 ON techsafe_source.native_approval_equipment_basis FOR EACH ROW
 EXECUTE FUNCTION techsafe_source.prevent_native_basis_mutation();
COMMENT ON TABLE techsafe_source.native_approval_equipment_basis IS
 'Private immutable prospective native approval evidence; not source delivery authority. Historical orders remain unresolved.';

-- Bind an actual export body and stable delivery event to the existing private
-- certificate. Old inert certificates remain NULL and cannot authorize this path.
ALTER TABLE techsafe_source.equipment_snapshot_certificates
 ADD COLUMN export_snapshot jsonb,
 ADD COLUMN event_id uuid,
 ADD CONSTRAINT techsafe_certificate_export_pair CHECK (
  (export_snapshot IS NULL AND event_id IS NULL) OR
  (export_snapshot IS NOT NULL AND jsonb_typeof(export_snapshot)='object'
    AND export_snapshot->>'schemaVersion' IS NOT DISTINCT FROM '2' AND event_id IS NOT NULL)
 );
CREATE UNIQUE INDEX techsafe_certificate_event_unique
 ON techsafe_source.equipment_snapshot_certificates(event_id) WHERE event_id IS NOT NULL;
