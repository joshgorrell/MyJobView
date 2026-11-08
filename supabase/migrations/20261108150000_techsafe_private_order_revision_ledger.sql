-- Integration-private revision ledger. This is storage only: no export authority,
-- automatic mutation observer, delivery, checkout, or production activation.
-- A trusted backend must verify source evidence and perform atomic transitions
-- before any future sender is enabled. Never treat these rows as approval proof.
CREATE TABLE techsafe_source.order_revision_ledger (
  connection_id uuid NOT NULL REFERENCES techsafe_source.integration_connections(connection_id),
  organization_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  connection_generation bigint NOT NULL CHECK (connection_generation >= 1),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','candidate')),
  hold_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id,sales_order_id),
  CONSTRAINT techsafe_revision_hold_reason CHECK (
    (state='held' AND hold_reason IS NOT NULL AND char_length(hold_reason) BETWEEN 1 AND 128)
    OR (state='candidate' AND hold_reason IS NULL)
  )
);
CREATE INDEX techsafe_order_revision_org_idx
  ON techsafe_source.order_revision_ledger(organization_id,sales_order_id);

-- No public, browser, service_role, or authenticated access. This is a
-- privileged-server-only internal ledger, not an API or customer data model.
REVOKE ALL ON techsafe_source.order_revision_ledger FROM PUBLIC,anon,authenticated,service_role;

-- Caller must already own a row lock, and have verified the original Sales
-- Order's approved proposal FK, customer approval, complete applied changes,
-- source freshness, and current connection generation in the same transaction.
-- The function deliberately cannot attest to those facts; this is an atomic
-- compare-and-swap primitive, not a grant of source authority.
CREATE FUNCTION techsafe_source.cas_order_revision(
 p_connection uuid,p_order uuid,p_organization uuid,p_proposal uuid,
 p_expected_revision bigint,p_expected_generation bigint,
 p_next_generation bigint,p_next_fingerprint text,p_next_state text,
 p_hold_reason text
) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE old_row techsafe_source.order_revision_ledger%ROWTYPE; new_revision bigint;
BEGIN
 IF p_connection IS NULL OR p_order IS NULL OR p_organization IS NULL OR p_proposal IS NULL
   OR p_next_generation IS NULL OR p_next_generation < 1
   OR p_next_fingerprint IS NULL OR p_next_fingerprint !~ '^[a-f0-9]{64}$'
   OR p_next_state NOT IN ('held','candidate') OR p_next_state IS NULL
   OR (p_next_state='held' AND (p_hold_reason IS NULL OR char_length(p_hold_reason) NOT BETWEEN 1 AND 128))
   OR (p_next_state='candidate' AND p_hold_reason IS NOT NULL)
 THEN RETURN NULL; END IF;
 -- Serializes first writers as well as subsequent writers on a given order.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_connection::text || ':' || p_order::text,0));
 SELECT * INTO old_row FROM techsafe_source.order_revision_ledger
 WHERE connection_id=p_connection AND sales_order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN
  IF p_expected_revision IS NOT NULL OR p_expected_generation IS NOT NULL THEN RETURN NULL; END IF;
  -- New rows always start held. Candidate authorization must be a separate
  -- reviewed transaction after the private source evidence gate exists.
  IF p_next_state <> 'held' THEN RETURN NULL; END IF;
  INSERT INTO techsafe_source.order_revision_ledger(
   connection_id,organization_id,sales_order_id,proposal_id,revision,
   connection_generation,source_fingerprint,state,hold_reason)
  VALUES(p_connection,p_organization,p_order,p_proposal,1,p_next_generation,
   p_next_fingerprint,p_next_state,p_hold_reason);
  RETURN 1;
 END IF;
 IF old_row.organization_id<>p_organization OR old_row.proposal_id<>p_proposal
   OR p_expected_revision IS DISTINCT FROM old_row.revision
   OR p_expected_generation IS DISTINCT FROM old_row.connection_generation
   OR p_next_generation<old_row.connection_generation OR old_row.revision=9223372036854775807
 THEN RETURN NULL; END IF;
 IF p_next_state='candidate' THEN
  -- Candidate promotion requires a separate source authorization boundary.
  RETURN NULL;
 END IF;
 new_revision:=old_row.revision+1;
 UPDATE techsafe_source.order_revision_ledger
 SET revision=new_revision,connection_generation=p_next_generation,
  source_fingerprint=p_next_fingerprint,state='held',
  hold_reason=p_hold_reason,updated_at=now()
 WHERE connection_id=p_connection AND sales_order_id=p_order;
 RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION techsafe_source.cas_order_revision(
 uuid,uuid,uuid,uuid,bigint,bigint,bigint,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
-- No triggers, grants, activation, backfills or writes to business tables.
