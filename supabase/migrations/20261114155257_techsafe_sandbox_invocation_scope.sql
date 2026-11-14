-- Private administrator-issued capabilities for sandbox sends only. No ticket
-- issuance RPC, service-role API grant, credentials or activation are created.
CREATE TABLE IF NOT EXISTS techsafe_source.native_invocation_tickets (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 connection_id uuid NOT NULL REFERENCES techsafe_source.integration_connections(connection_id),
 sales_order_id uuid NOT NULL,
 connection_generation bigint NOT NULL CHECK(connection_generation>0),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes')
);
-- Existing unscoped tickets remain NULL and cannot invoke the new handler.
ALTER TABLE techsafe_source.native_invocation_tickets
 ADD COLUMN IF NOT EXISTS purpose text CHECK(purpose='sandbox_send');
ALTER TABLE techsafe_source.native_invocation_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.native_invocation_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.native_invocation_tickets FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE techsafe_source.native_invocation_tickets IS
 'Privileged SQL-issued, hashed, scoped, at-most-five-minute, single-use sandbox send capabilities. Never receiver credentials or approval authority.';
