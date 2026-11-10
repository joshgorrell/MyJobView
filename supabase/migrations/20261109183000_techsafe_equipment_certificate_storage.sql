-- REVIEW REQUIRED: private, inert storage for transaction-certified Sales Order evidence.
-- This migration DOES NOT certify, populate, export or activate anything.
-- Only a future trusted SERIALIZABLE server transaction may create certificates.
-- Actual sales_orders.proposal_id is the source of approved proposal_line_items.
CREATE TABLE IF NOT EXISTS techsafe_source.equipment_snapshot_certificates (
 certificate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL,
 sales_order_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 proposal_id uuid NOT NULL,
 connection_generation bigint NOT NULL CHECK (connection_generation>0),
 source_revision bigint NOT NULL CHECK (source_revision>0),
 source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$' AND source_fingerprint<>repeat('0',64)),
 -- This digest covers ALL reconciled equipment content, including descriptions, prices and exclusions.
 equipment_fingerprint text NOT NULL CHECK (equipment_fingerprint ~ '^[0-9a-f]{64}$' AND equipment_fingerprint<>repeat('0',64)),
 canonical_version text NOT NULL CHECK (canonical_version='mjv-techsafe-complete-equipment-v1'),
 equipment_count integer NOT NULL CHECK (equipment_count>=0 AND equipment_count<=10000),
 state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','certified','revoked')),
 certified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT techsafe_certificate_certified_timestamp CHECK (state<>'certified' OR certified_at IS NOT NULL),
 CONSTRAINT techsafe_certificate_revision_unique UNIQUE (connection_id,sales_order_id,connection_generation,source_revision),
 CONSTRAINT techsafe_certificate_connection_scope_unique UNIQUE (certificate_id,connection_id,sales_order_id)
);
CREATE INDEX IF NOT EXISTS techsafe_certificates_order_latest
 ON techsafe_source.equipment_snapshot_certificates(connection_id,sales_order_id,connection_generation DESC,source_revision DESC);
-- Defense in depth: no browser, API role or PUBLIC access. Do not add
-- SECURITY DEFINER writers or GRANTs before explicit security review.
ALTER TABLE techsafe_source.equipment_snapshot_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.equipment_snapshot_certificates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.equipment_snapshot_certificates FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE techsafe_source.equipment_snapshot_certificates IS
 'INERT review-only certificate storage. No writer, authorizer or delivery mechanism; never interpret row presence as approved source evidence.';
