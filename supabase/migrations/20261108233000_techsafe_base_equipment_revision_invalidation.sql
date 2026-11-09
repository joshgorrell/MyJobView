-- Invalidate existing Techsafe source ledgers whenever linked approved
-- Sales Order proposal-line storage changes. Proposals alone are NOT exported.
-- Human review and PostgreSQL concurrency verification required before merge.
CREATE OR REPLACE FUNCTION techsafe_source.invalidate_base_equipment_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior_proposal uuid; prior_org uuid; next_proposal uuid; next_org uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  prior_proposal:=OLD.proposal_id; prior_org:=OLD.organization_id;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  next_proposal:=NEW.proposal_id; next_org:=NEW.organization_id;
 END IF;
 -- Only existing integration connections to actual Sales Orders are affected.
 -- UPDATE reparenting invalidates both original and destination sources.
 UPDATE techsafe_source.order_revision_ledger l
 SET revision=CASE WHEN l.revision<9223372036854775807 THEN l.revision+1 ELSE l.revision END,
     state='held',
     hold_reason=CASE WHEN l.revision=9223372036854775807 THEN 'revision_exhausted'
       ELSE 'base_equipment_mutated_requires_reverification' END,
     source_fingerprint=repeat('0',64),updated_at=clock_timestamp()
 FROM techsafe_source.integration_connections c
 WHERE c.connection_id=l.connection_id
   AND c.sales_order_id=l.sales_order_id
   AND c.organization_id=l.organization_id
   AND c.proposal_id=l.proposal_id
   AND ((c.proposal_id=prior_proposal AND c.organization_id=prior_org)
     OR (c.proposal_id=next_proposal AND c.organization_id=next_org));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION techsafe_source.invalidate_base_equipment_source()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_base_equipment_mutation_hold
 AFTER INSERT OR UPDATE OR DELETE ON public.proposal_line_items
 FOR EACH ROW EXECUTE FUNCTION techsafe_source.invalidate_base_equipment_source();
