-- Fail-closed invalidation of previously tracked Sales Order snapshots.
-- This does not create connection records, authorize candidates or send data.
-- A changed source invalidates existing ledger rows even if no sender is active.
CREATE FUNCTION techsafe_source.invalidate_order_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source_proposal uuid; source_order uuid; source_org uuid; old_proposal uuid; old_org uuid;
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='proposal_line_items' THEN
  IF OLD.proposal_id IS DISTINCT FROM NEW.proposal_id OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
   old_proposal:=OLD.proposal_id; old_org:=OLD.organization_id;
   UPDATE techsafe_source.order_revision_ledger l
   SET revision=LEAST(l.revision+CASE WHEN l.revision<9223372036854775807 THEN 1 ELSE 0 END,9223372036854775807),
       state='held',hold_reason='source_mutated_requires_reverification',
       source_fingerprint=repeat('0',64),updated_at=clock_timestamp()
   FROM techsafe_source.integration_connections c
   WHERE c.connection_id=l.connection_id AND c.organization_id=old_org AND c.proposal_id=old_proposal;
  END IF;
 END IF;
 IF TG_TABLE_NAME = 'proposal_line_items' THEN
   source_proposal := CASE WHEN TG_OP='DELETE' THEN OLD.proposal_id ELSE NEW.proposal_id END;
   source_org := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 ELSIF TG_TABLE_NAME = 'proposals' THEN
   source_proposal := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   source_org := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 ELSE
   source_order := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   source_org := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 END IF;
 UPDATE techsafe_source.order_revision_ledger l
 SET revision=l.revision+1, state='held',
     hold_reason='source_mutated_requires_reverification',
     source_fingerprint=repeat('0',64),updated_at=clock_timestamp()
 FROM techsafe_source.integration_connections c
 WHERE c.connection_id=l.connection_id
   AND c.organization_id=source_org
   AND (source_order IS NULL OR c.sales_order_id=source_order)
   AND (source_proposal IS NULL OR c.proposal_id=source_proposal)
   AND l.revision < 9223372036854775807;
 -- When a row has reached bigint maximum, it must remain held, never candidate.
 UPDATE techsafe_source.order_revision_ledger l
 SET state='held',hold_reason='revision_exhausted',
     source_fingerprint=repeat('0',64),updated_at=clock_timestamp()
 FROM techsafe_source.integration_connections c
 WHERE c.connection_id=l.connection_id AND c.organization_id=source_org
   AND (source_order IS NULL OR c.sales_order_id=source_order)
   AND (source_proposal IS NULL OR c.proposal_id=source_proposal)
   AND l.revision=9223372036854775807;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION techsafe_source.invalidate_order_source()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_sales_order_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_order_source();
CREATE TRIGGER techsafe_approved_proposal_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.proposals
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_order_source();
CREATE TRIGGER techsafe_line_item_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.proposal_line_items
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_order_source();
-- No sender, candidate promotion, grants or checkout activation.
