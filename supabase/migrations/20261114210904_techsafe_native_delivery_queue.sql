-- Native transactional outbox. Source writes record identities only; HTTP is
-- queued by a separate opt-in scheduler, never by a business-row trigger.
ALTER TABLE techsafe_source.integration_connections ADD COLUMN dispatch_environment text
 CHECK(dispatch_environment IN ('sandbox','production'));
CREATE INDEX techsafe_dispatch_order_scope ON techsafe_source.integration_connections(organization_id,sales_order_id);
CREATE INDEX techsafe_dispatch_proposal_scope ON techsafe_source.integration_connections(organization_id,proposal_id);
CREATE TABLE techsafe_source.native_dispatch_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment IN ('sandbox','production')),
 worker_url text CHECK(worker_url IS NULL OR worker_url='https://bqtsuzvuvqvgidipbsis.supabase.co/functions/v1/techsafe-dispatch-order'),
 batch_size integer NOT NULL DEFAULT 5 CHECK(batch_size BETWEEN 1 AND 10)
);
INSERT INTO techsafe_source.native_dispatch_settings(id) VALUES(true);
CREATE TABLE techsafe_source.native_delivery_queue (
 connection_id uuid PRIMARY KEY REFERENCES techsafe_source.integration_connections(connection_id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,sales_order_id uuid NOT NULL,proposal_id uuid NOT NULL,
 dirty_sequence bigint NOT NULL DEFAULT 1 CHECK(dirty_sequence>0),
 acknowledged_sequence bigint NOT NULL DEFAULT 0 CHECK(acknowledged_sequence>=0 AND acknowledged_sequence<=dirty_sequence),
 attempt_sequence bigint,request_id bigint UNIQUE,lease_expires_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 16),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_result text,last_acknowledged_revision text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(connection_id,organization_id,sales_order_id,proposal_id)
  REFERENCES techsafe_source.integration_connections(connection_id,organization_id,sales_order_id,proposal_id) ON DELETE CASCADE,
 CHECK((request_id IS NULL AND attempt_sequence IS NULL AND lease_expires_at IS NULL)
  OR (request_id IS NOT NULL AND attempt_sequence IS NOT NULL AND attempt_sequence<=dirty_sequence AND lease_expires_at IS NOT NULL))
);
CREATE INDEX native_delivery_queue_due ON techsafe_source.native_delivery_queue(next_attempt_at,connection_id)
 WHERE request_id IS NULL AND dirty_sequence>acknowledged_sequence;
CREATE INDEX native_delivery_queue_inflight ON techsafe_source.native_delivery_queue(lease_expires_at)
 WHERE request_id IS NOT NULL;
ALTER TABLE techsafe_source.native_dispatch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_dispatch_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_delivery_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_delivery_queue FORCE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.native_dispatch_settings,techsafe_source.native_delivery_queue FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE techsafe_source.native_invocation_tickets DROP CONSTRAINT native_invocation_tickets_purpose_check,
 ADD CONSTRAINT native_invocation_tickets_purpose_check CHECK(purpose IN ('sandbox_send','order_dispatch')),
 ADD COLUMN dispatch_environment text CHECK(dispatch_environment IN ('sandbox','production')),
 ADD COLUMN dispatch_sequence bigint CHECK(dispatch_sequence>0);

CREATE FUNCTION techsafe_source.mark_native_delivery_dirty(p_org uuid,p_order uuid DEFAULT NULL,p_proposal uuid DEFAULT NULL,
 p_contact uuid DEFAULT NULL,p_product uuid DEFAULT NULL,p_connection uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_org IS NULL OR (p_order IS NULL AND p_proposal IS NULL AND p_contact IS NULL AND p_product IS NULL AND p_connection IS NULL) THEN RETURN; END IF;
 INSERT INTO techsafe_source.native_delivery_queue(connection_id,organization_id,sales_order_id,proposal_id)
 SELECT c.connection_id,c.organization_id,c.sales_order_id,c.proposal_id FROM techsafe_source.integration_connections c
 WHERE c.organization_id=p_org AND (p_connection IS NULL OR c.connection_id=p_connection)
  AND (p_order IS NULL OR c.sales_order_id=p_order) AND (p_proposal IS NULL OR c.proposal_id=p_proposal)
  AND (p_contact IS NULL OR EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.id=c.sales_order_id AND so.organization_id=c.organization_id AND so.contact_id=p_contact))
  AND (p_product IS NULL OR EXISTS(SELECT 1 FROM public.proposal_line_items li WHERE li.proposal_id=c.proposal_id AND li.organization_id=c.organization_id AND li.product_id=p_product))
 ON CONFLICT(connection_id) DO UPDATE SET dirty_sequence=native_delivery_queue.dirty_sequence+1,
  attempt_count=0,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp();
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.mark_native_delivery_dirty(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION techsafe_source.queue_native_source_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb;co record;
BEGIN
 -- Mark both old and new ownership when a mutable row changes its parent.
 FOR row_data IN SELECT value FROM jsonb_array_elements(CASE TG_OP
  WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
  ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
  CASE TG_TABLE_NAME
   WHEN 'integration_connections' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_connection:=(row_data->>'connection_id')::uuid);
   WHEN 'sales_orders' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_order:=(row_data->>'id')::uuid);
   WHEN 'proposals' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_proposal:=(row_data->>'id')::uuid);
   WHEN 'proposal_line_items' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_proposal:=(row_data->>'proposal_id')::uuid);
   WHEN 'change_orders' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_order:=(row_data->>'sales_order_id')::uuid);
   WHEN 'revisions' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_order:=(row_data->>'sales_order_id')::uuid);
   WHEN 'change_order_line_items' THEN
    SELECT sales_order_id,organization_id INTO co FROM public.change_orders WHERE id=(row_data->>'change_order_id')::uuid;
    IF FOUND AND co.organization_id=(row_data->>'organization_id')::uuid THEN
     PERFORM techsafe_source.mark_native_delivery_dirty(co.organization_id,p_order:=co.sales_order_id);
    END IF;
   WHEN 'contacts' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_contact:=(row_data->>'id')::uuid);
   WHEN 'products' THEN
    PERFORM techsafe_source.mark_native_delivery_dirty((row_data->>'organization_id')::uuid,p_product:=(row_data->>'id')::uuid);
  END CASE;
 END LOOP;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.queue_native_source_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_queue_connection AFTER INSERT OR UPDATE ON techsafe_source.integration_connections FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_order AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_proposal AFTER INSERT OR UPDATE OR DELETE ON public.proposals FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_line AFTER INSERT OR UPDATE OR DELETE ON public.proposal_line_items FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_change AFTER INSERT OR UPDATE OR DELETE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_change_line AFTER INSERT OR UPDATE OR DELETE ON public.change_order_line_items FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_commit AFTER INSERT ON change_order_commit.revisions FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_contact AFTER UPDATE OF id,organization_id,full_name,contact_name ON public.contacts FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();
CREATE TRIGGER techsafe_queue_product AFTER UPDATE OF id,organization_id,name,manufacturer,model_number,sku,item_type ON public.products FOR EACH ROW EXECUTE FUNCTION techsafe_source.queue_native_source_event();

-- Existing connections are not adopted or activated by this migration. A
-- subsequent native event or explicit private mark call schedules reconciliation.
CREATE FUNCTION techsafe_source.run_native_delivery_queue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE settings techsafe_source.native_dispatch_settings%ROWTYPE;q record;c record;response record;
 payload jsonb;ack boolean;reason text;revision text;token text;request bigint;issued integer:=0;next_count integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('techsafe_source.native_delivery_queue',0)) THEN RETURN 0; END IF;
 SELECT * INTO settings FROM techsafe_source.native_dispatch_settings WHERE id=true FOR SHARE;
 IF NOT FOUND OR settings.enabled IS DISTINCT FROM true OR settings.worker_url IS NULL THEN RETURN 0; END IF;
 -- Recover results durably. Missing/unlogged responses eventually time out;
 -- their export events are retried by the existing idempotent native sender.
 FOR q IN SELECT * FROM techsafe_source.native_delivery_queue WHERE request_id IS NOT NULL
  ORDER BY lease_expires_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO response FROM net._http_response WHERE id=q.request_id ORDER BY created DESC LIMIT 1;
  IF NOT FOUND AND q.lease_expires_at>clock_timestamp() THEN CONTINUE; END IF;
  ack:=false;reason:='transport_unconfirmed';revision:=NULL;
  IF FOUND THEN
   BEGIN
    payload:=response.content::jsonb;
    ack:=coalesce(response.status_code BETWEEN 200 AND 299 AND payload->'accepted'='true'::jsonb,false);
    IF payload->>'reason' ~ '^[a-z_]{1,96}$' THEN reason:=payload->>'reason'; END IF;
    IF payload->>'sourceRevision' ~ '^[1-9][0-9]{0,15}$' THEN revision:=payload->>'sourceRevision'; END IF;
    -- Success without the sender's verified source revision is unconfirmed.
    ack:=ack AND revision IS NOT NULL;
   EXCEPTION WHEN invalid_text_representation THEN ack:=false; END;
  END IF;
  IF NOT ack AND reason='receiver_acknowledged' THEN reason:='transport_unconfirmed'; END IF;
  next_count:=CASE WHEN ack OR q.dirty_sequence>q.attempt_sequence THEN 0 ELSE least(q.attempt_count+1,16) END;
  UPDATE techsafe_source.native_delivery_queue SET
   acknowledged_sequence=CASE WHEN ack THEN greatest(acknowledged_sequence,q.attempt_sequence) ELSE acknowledged_sequence END,
   last_acknowledged_revision=CASE WHEN ack THEN revision ELSE last_acknowledged_revision END,
   last_result=CASE WHEN ack THEN 'receiver_acknowledged' ELSE reason END,
   request_id=NULL,attempt_sequence=NULL,lease_expires_at=NULL,attempt_count=next_count,
   next_attempt_at=clock_timestamp()+CASE WHEN ack OR q.dirty_sequence>q.attempt_sequence THEN interval '0 seconds'
    ELSE make_interval(secs=>least(3600,power(2,least(next_count,7))::integer*30)) END,
   updated_at=clock_timestamp() WHERE connection_id=q.connection_id;
 END LOOP;
 -- Connection-first locking matches native sender/admin scope locking. Never
 -- hold a business transaction or SQL connection across an HTTP round trip.
 FOR c IN SELECT conn.* FROM techsafe_source.integration_connections conn
  JOIN techsafe_source.native_delivery_queue pending ON pending.connection_id=conn.connection_id
  WHERE conn.enabled=true AND conn.status='active' AND conn.dispatch_environment=settings.environment
   AND pending.dirty_sequence>pending.acknowledged_sequence AND pending.request_id IS NULL AND pending.next_attempt_at<=clock_timestamp()
  ORDER BY pending.next_attempt_at,conn.connection_id LIMIT settings.batch_size FOR UPDATE OF conn SKIP LOCKED LOOP
  SELECT * INTO q FROM techsafe_source.native_delivery_queue WHERE connection_id=c.connection_id FOR UPDATE;
  IF q.request_id IS NOT NULL OR q.acknowledged_sequence>=q.dirty_sequence OR q.next_attempt_at>clock_timestamp() THEN CONTINUE; END IF;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO techsafe_source.native_invocation_tickets(token_hash,connection_id,sales_order_id,connection_generation,expires_at,purpose,dispatch_environment,dispatch_sequence)
   VALUES(encode(sha256(convert_to(token,'UTF8')),'hex'),c.connection_id,c.sales_order_id,c.connection_generation,
    clock_timestamp()+interval '2 minutes','order_dispatch',settings.environment,q.dirty_sequence);
  request:=net.http_post(url:=settings.worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:=jsonb_build_object('connectionId',c.connection_id,'orderId',c.sales_order_id),timeout_milliseconds:=30000);
  IF request IS NULL THEN RAISE EXCEPTION 'Native delivery transport did not return a request identity'; END IF;
  UPDATE techsafe_source.native_delivery_queue SET attempt_sequence=q.dirty_sequence,request_id=request,
   lease_expires_at=clock_timestamp()+interval '2 minutes',last_result='delivery_queued',updated_at=clock_timestamp() WHERE connection_id=c.connection_id;
  issued:=issued+1;
 END LOOP;
 RETURN issued;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.run_native_delivery_queue() FROM PUBLIC,anon,authenticated,service_role;
-- Cron installation is a separate reviewed step. This migration cannot enable
-- HTTP: settings remain disabled, URL is NULL, and connection environments NULL.
