-- Prospective whole-order evidence around existing native CO commits. No CO
-- replay, native writer replacement, historical backfill or connection activation.
CREATE TABLE techsafe_source.native_commit_preparations (
 change_order_id uuid PRIMARY KEY REFERENCES public.change_orders(id) ON DELETE CASCADE,
 sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,proposal_id uuid NOT NULL,
 transaction_id bigint NOT NULL,backend_pid integer NOT NULL,
 root_basis_hash text NOT NULL,previous_heads jsonb NOT NULL
);
CREATE TABLE techsafe_source.native_committed_order_basis (
 native_revision_id uuid PRIMARY KEY REFERENCES change_order_commit.revisions(id) ON DELETE CASCADE,
 sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,proposal_id uuid NOT NULL,
 order_sequence bigint NOT NULL CHECK(order_sequence>0),
 root_basis_hash text NOT NULL CHECK(root_basis_hash ~ '^[a-f0-9]{64}$'),
 basis jsonb NOT NULL CHECK(jsonb_typeof(basis)='object'),
 basis_hash text NOT NULL CHECK(basis_hash ~ '^[a-f0-9]{64}$'),
 committed_heads jsonb NOT NULL CHECK(jsonb_typeof(committed_heads)='array'),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sales_order_id,order_sequence)
);
ALTER TABLE techsafe_source.native_commit_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_commit_preparations FORCE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_committed_order_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_committed_order_basis FORCE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.native_commit_preparations,techsafe_source.native_committed_order_basis FROM PUBLIC,anon,authenticated,service_role;

-- Verify current approved CO source against its latest immutable native commit.
-- A status reversal, uncommitted legacy approval or source drift is not evidence.
CREATE FUNCTION techsafe_source.current_native_commit_heads(p_order uuid,p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE co record;r change_order_commit.revisions%ROWTYPE;lines jsonb;heads jsonb:='[]';
BEGIN
 IF (SELECT count(*) FROM public.change_orders WHERE sales_order_id=p_order)>1000 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.change_orders WHERE sales_order_id=p_order AND organization_id IS DISTINCT FROM p_org)
  OR EXISTS(SELECT 1 FROM change_order_commit.revisions WHERE sales_order_id=p_order AND organization_id IS DISTINCT FROM p_org)
 THEN RETURN NULL; END IF;
 FOR co IN SELECT * FROM public.change_orders c WHERE c.sales_order_id=p_order AND c.organization_id=p_org
   AND (c.status IN ('approved','completed') OR EXISTS(SELECT 1 FROM change_order_commit.revisions hist WHERE hist.change_order_id=c.id))
   ORDER BY c.id LOOP
  IF co.status NOT IN ('approved','completed') OR co.status IS NULL OR co.is_locked IS DISTINCT FROM true
    OR co.is_active IS DISTINCT FROM false OR co.approval_date IS NULL
    OR (co.requires_customer_approval IS TRUE AND co.customer_approved IS DISTINCT FROM true) THEN RETURN NULL; END IF;
  SELECT * INTO r FROM change_order_commit.revisions WHERE change_order_id=co.id ORDER BY revision_number DESC LIMIT 1;
  IF NOT FOUND OR r.organization_id IS DISTINCT FROM p_org OR r.sales_order_id IS DISTINCT FROM p_order THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.change_order_line_items WHERE change_order_id=co.id AND organization_id IS DISTINCT FROM p_org)
   OR (SELECT count(*) FROM public.change_order_line_items WHERE change_order_id=co.id)>10000 THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(li) ORDER BY li.sort_order NULLS LAST,li.created_at,li.id),'[]'::jsonb)
   INTO lines FROM public.change_order_line_items li WHERE li.change_order_id=co.id AND li.organization_id=p_org;
  IF lines IS DISTINCT FROM r.committed_lines
    OR r.source_fingerprint IS DISTINCT FROM encode(sha256(convert_to(r.committed_lines::text||':'||r.committed_totals::text,'UTF8')),'hex')
    OR (r.committed_totals->>'change_amount')::numeric IS DISTINCT FROM co.change_amount
    OR (r.committed_totals->>'tax_amount')::numeric IS DISTINCT FROM co.tax_amount
    OR (r.committed_totals->>'is_billable')::boolean IS DISTINCT FROM co.is_billable THEN RETURN NULL; END IF;
  heads:=heads||jsonb_build_array(jsonb_build_object('changeOrderId',co.id,'revisionId',r.id,
    'revisionNumber',r.revision_number,'sourceFingerprint',r.source_fingerprint));
 END LOOP;
 RETURN heads;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.current_native_commit_heads(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.prepare_native_order_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE co public.change_orders%ROWTYPE;so public.sales_orders%ROWTYPE;
 root techsafe_source.native_approval_equipment_basis%ROWTYPE;
 latest techsafe_source.native_committed_order_basis%ROWTYPE;body jsonb;heads jsonb;has_latest boolean;
BEGIN
 IF TG_TABLE_NAME='change_orders' THEN
  co:=OLD;
 ELSE
  IF NEW.transaction_id IS DISTINCT FROM txid_current() OR NEW.backend_pid IS DISTINCT FROM pg_backend_pid() THEN RETURN NEW; END IF;
  SELECT * INTO co FROM public.change_orders WHERE id=NEW.change_order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
 END IF;
 DELETE FROM techsafe_source.native_commit_preparations WHERE change_order_id=co.id;
 SELECT * INTO root FROM techsafe_source.native_approval_equipment_basis
  WHERE sales_order_id=co.sales_order_id AND organization_id=co.organization_id;
 IF NOT FOUND OR root.basis_hash IS DISTINCT FROM encode(sha256(convert_to(root.basis::text,'UTF8')),'hex') THEN RETURN NEW; END IF;
 SELECT * INTO so FROM public.sales_orders WHERE id=co.sales_order_id AND organization_id=co.organization_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- Lock the parent and current rows before checking pre-commit scope. Parent
 -- FK KEY SHARE checks serialize concurrent line INSERTs; row SHARE locks also
 -- exclude concurrent line edits, including edits outside this CO's targets.
 PERFORM 1 FROM public.proposals WHERE id=so.proposal_id AND organization_id=so.organization_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.proposal_line_items WHERE proposal_id=so.proposal_id FOR SHARE;
 IF root.proposal_id IS DISTINCT FROM so.proposal_id THEN RETURN NEW; END IF;
 body:=techsafe_source.current_approval_equipment_basis(so.id);
 heads:=techsafe_source.current_native_commit_heads(so.id,so.organization_id);
 IF body IS NULL OR heads IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM techsafe_source.native_committed_order_basis
  WHERE sales_order_id=so.id ORDER BY order_sequence DESC LIMIT 1;
 has_latest:=FOUND;
 IF has_latest THEN
  IF latest.organization_id IS DISTINCT FROM so.organization_id OR latest.proposal_id IS DISTINCT FROM so.proposal_id
    OR latest.root_basis_hash IS DISTINCT FROM root.basis_hash OR latest.basis IS DISTINCT FROM body
    OR latest.basis_hash IS DISTINCT FROM encode(sha256(convert_to(latest.basis::text,'UTF8')),'hex')
    OR latest.committed_heads IS DISTINCT FROM heads THEN RETURN NEW; END IF;
 ELSE
  IF heads IS DISTINCT FROM '[]'::jsonb OR root.basis IS DISTINCT FROM body THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO techsafe_source.native_commit_preparations(change_order_id,sales_order_id,organization_id,proposal_id,
   transaction_id,backend_pid,root_basis_hash,previous_heads)
 VALUES(co.id,so.id,so.organization_id,so.proposal_id,txid_current(),pg_backend_pid(),root.basis_hash,heads);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.prepare_native_order_commit() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_prepare_initial_order_commit BEFORE UPDATE OF status ON public.change_orders
FOR EACH ROW WHEN (OLD.status IN ('draft','pending_approval') AND NEW.status='approved')
EXECUTE FUNCTION techsafe_source.prepare_native_order_commit();
CREATE TRIGGER techsafe_prepare_staged_order_commit AFTER INSERT ON change_order_commit.material_revision_authorizations
FOR EACH ROW EXECUTE FUNCTION techsafe_source.prepare_native_order_commit();

CREATE FUNCTION techsafe_source.capture_native_order_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prep techsafe_source.native_commit_preparations%ROWTYPE;body jsonb;heads jsonb;
 previous_other jsonb;current_other jsonb;previous_number bigint;sequence bigint;
BEGIN
 DELETE FROM techsafe_source.native_commit_preparations WHERE change_order_id=NEW.change_order_id
  AND transaction_id=txid_current() AND backend_pid=pg_backend_pid() RETURNING * INTO prep;
 IF NOT FOUND OR prep.sales_order_id IS DISTINCT FROM NEW.sales_order_id OR prep.organization_id IS DISTINCT FROM NEW.organization_id THEN RETURN NULL; END IF;
 heads:=techsafe_source.current_native_commit_heads(NEW.sales_order_id,NEW.organization_id);
 body:=techsafe_source.current_approval_equipment_basis(NEW.sales_order_id);
 IF heads IS NULL OR body IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(h ORDER BY h->>'changeOrderId'),'[]') INTO previous_other
  FROM jsonb_array_elements(prep.previous_heads) h WHERE h->>'changeOrderId'<>NEW.change_order_id::text;
 SELECT coalesce(jsonb_agg(h ORDER BY h->>'changeOrderId'),'[]') INTO current_other
  FROM jsonb_array_elements(heads) h WHERE h->>'changeOrderId'<>NEW.change_order_id::text;
 SELECT (h->>'revisionNumber')::bigint INTO previous_number FROM jsonb_array_elements(prep.previous_heads) h
  WHERE h->>'changeOrderId'=NEW.change_order_id::text;
 IF previous_other IS DISTINCT FROM current_other OR NEW.revision_number<>coalesce(previous_number,0)+1
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(heads) h WHERE h->>'revisionId'=NEW.id::text)
 THEN RETURN NULL; END IF;
 SELECT coalesce(max(order_sequence),0)+1 INTO sequence FROM techsafe_source.native_committed_order_basis WHERE sales_order_id=NEW.sales_order_id;
 INSERT INTO techsafe_source.native_committed_order_basis(native_revision_id,sales_order_id,organization_id,proposal_id,
   order_sequence,root_basis_hash,basis,basis_hash,committed_heads)
 VALUES(NEW.id,NEW.sales_order_id,NEW.organization_id,prep.proposal_id,sequence,prep.root_basis_hash,
   body,encode(sha256(convert_to(body::text,'UTF8')),'hex'),heads);
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.capture_native_order_commit() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_capture_native_order_commit AFTER INSERT ON change_order_commit.revisions
FOR EACH ROW EXECUTE FUNCTION techsafe_source.capture_native_order_commit();

CREATE FUNCTION techsafe_source.prevent_committed_basis_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.sales_orders WHERE id=OLD.sales_order_id)
   OR NOT EXISTS(SELECT 1 FROM change_order_commit.revisions WHERE id=OLD.native_revision_id)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Native committed order basis is immutable';
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.prevent_committed_basis_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_committed_basis_immutable BEFORE UPDATE OR DELETE ON techsafe_source.native_committed_order_basis
FOR EACH ROW EXECUTE FUNCTION techsafe_source.prevent_committed_basis_mutation();
COMMENT ON TABLE techsafe_source.native_committed_order_basis IS
 'Prospective native whole-order checkpoints anchored to original native approval and immutable native CO commits; never a CO replay or historical reconciliation.';
