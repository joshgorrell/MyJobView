-- Durable retry identity for negative source observations. No customer data,
-- purchase authority or credentials. Shares the existing per-order revision.
CREATE TABLE techsafe_source.negative_order_exports (
 connection_id uuid NOT NULL,
 sales_order_id uuid NOT NULL,
 event_payload jsonb NOT NULL CHECK(jsonb_typeof(event_payload)='object'),
 PRIMARY KEY(connection_id,sales_order_id),
 FOREIGN KEY(connection_id,sales_order_id)
  REFERENCES techsafe_source.order_revision_ledger(connection_id,sales_order_id)
  ON DELETE CASCADE
);
ALTER TABLE techsafe_source.negative_order_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.negative_order_exports FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE techsafe_source.negative_order_exports IS
 'Exclusively dependent negative export retry identity; removed with its owning revision ledger row. Not source approval or positive delivery authority.';
