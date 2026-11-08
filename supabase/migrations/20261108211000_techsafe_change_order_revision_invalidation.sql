-- Hold existing Techsafe Sales Order revision ledgers when change orders mutate.
-- This is not an export authorization and does not enable synchronization.
CREATE OR REPLACE FUNCTION techsafe_source.invalidate_change_order_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected_order uuid; affected_org uuid; prior_order uuid; prior_org uuid;
BEGIN
 IF TG_TABLE_NAME = 'change_orders' THEN
  affected_order := CASE WHEN TG_OP='DELETE' THEN OLD.sales_order_id ELSE NEW.sales_order_id END;
  affected_org := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  IF TG_OP='UPDATE' THEN
   prior_order:=OLD.sales_order_id; prior_org:=OLD.organization_id;
  END IF;
 ELSE
  SELECT co.sales_order_id, co.organization_id INTO affected_order, affected_org
  FROM public.change_orders co
  WHERE co.id = CASE WHEN TG_OP='DELETE' THEN OLD.change_order_id ELSE NEW.change_order_id END
  FOR SHARE;
  IF TG_OP='UPDATE' AND OLD.change_order_id IS DISTINCT FROM NEW.change_order_id THEN
   SELECT co.sales_order_id, co.organization_id INTO prior_order, prior_org
   FROM public.change_orders co WHERE co.id=OLD.change_order_id
   FOR SHARE;
  END IF;
 END IF;
 -- A mutation affecting either the previous or new parent must invalidate
 -- the tracked source, including an approval reversal or line removal.
 UPDATE techsafe_source.order_revision_ledger l
 SET revision=CASE WHEN l.revision<9223372036854775807 THEN l.revision+1 ELSE l.revision END,
     state='held',
     hold_reason=CASE WHEN l.revision=9223372036854775807 THEN 'revision_exhausted'
       ELSE 'source_mutated_requires_reverification' END,
     source_fingerprint=repeat('0',64),updated_at=clock_timestamp()
 FROM techsafe_source.integration_connections c
 WHERE c.connection_id=l.connection_id AND
   ((c.sales_order_id=affected_order AND c.organization_id=affected_org)
    OR (c.sales_order_id=prior_order AND c.organization_id=prior_org));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION techsafe_source.invalidate_change_order_source()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_change_order_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.change_orders
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_change_order_source();
CREATE TRIGGER techsafe_change_line_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.change_order_line_items
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_change_order_source();
