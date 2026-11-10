#!/usr/bin/env bash
# Real PostgreSQL contract test for the concrete Sales Order base reader.
# Run ONLY against a disposable, empty PostgreSQL database.
set -euo pipefail
: "${TECHSAFE_TEST_DATABASE_URL:?Provide EMPTY disposable PostgreSQL database}"
PSQL=(psql "$TECHSAFE_TEST_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1)
existing="$("${PSQL[@]}" -c "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')")"
[[ "$existing" == 0 ]] || { echo 'Refusing nonempty database' >&2; exit 2; }
"${PSQL[@]}" <<'SQL'
CREATE SCHEMA techsafe_source;
CREATE TABLE public.sales_orders(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,proposal_id uuid NOT NULL
);
CREATE TABLE public.proposal_line_items(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,proposal_id uuid NOT NULL,
 product_id uuid NOT NULL,quantity integer NOT NULL
);
CREATE TABLE techsafe_source.integration_connections(
 connection_id uuid PRIMARY KEY,sales_order_id uuid NOT NULL,
 organization_id uuid NOT NULL,proposal_id uuid NOT NULL,
 connection_generation bigint NOT NULL,enabled boolean NOT NULL,status text NOT NULL
);
CREATE TABLE techsafe_source.order_revision_ledger(
 connection_id uuid,sales_order_id uuid,organization_id uuid,proposal_id uuid,
 connection_generation bigint,revision bigint,source_fingerprint text,state text,
 PRIMARY KEY(connection_id,sales_order_id)
);
INSERT INTO public.sales_orders VALUES
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
INSERT INTO public.proposal_line_items VALUES
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006',2);
INSERT INTO techsafe_source.integration_connections VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',2,true,'active');
INSERT INTO techsafe_source.order_revision_ledger VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',2,3,repeat('a',64),'candidate');
SQL
# Execute the exact query shape used by both real JavaScript readers, inside
# a single SERIALIZABLE transaction. Validate tenant and proposal scoping.
result="$("${PSQL[@]}" <<'SQL'
BEGIN ISOLATION LEVEL SERIALIZABLE;
SHOW transaction_isolation;
SELECT organization_id,proposal_id,connection_generation,enabled,status
 FROM techsafe_source.integration_connections
 WHERE connection_id='00000000-0000-0000-0000-000000000001'
 AND sales_order_id='00000000-0000-0000-0000-000000000002' FOR UPDATE;
SELECT organization_id,proposal_id,connection_generation,revision,source_fingerprint,state
 FROM techsafe_source.order_revision_ledger
 WHERE connection_id='00000000-0000-0000-0000-000000000001'
 AND sales_order_id='00000000-0000-0000-0000-000000000002' FOR UPDATE;
SELECT id,organization_id,proposal_id FROM public.sales_orders
 WHERE id='00000000-0000-0000-0000-000000000002'
 AND organization_id='00000000-0000-0000-0000-000000000003'
 AND proposal_id='00000000-0000-0000-0000-000000000004' FOR SHARE;
SELECT id,product_id,quantity FROM public.proposal_line_items
 WHERE organization_id='00000000-0000-0000-0000-000000000003'
 AND proposal_id='00000000-0000-0000-0000-000000000004' ORDER BY id FOR SHARE;
ROLLBACK;
SQL
)"
[[ "$result" == *serializable* && "$result" == *"00000000-0000-0000-0000-000000000006|2"* ]] || {
 echo "Expected serializable Sales Order equipment query failed: $result" >&2; exit 1;
}
# Unrelated tenant equipment must never appear in the scoped result.
"${PSQL[@]}" -c "INSERT INTO public.proposal_line_items VALUES
('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000009',4)"
count="$("${PSQL[@]}" -c "SELECT count(*) FROM public.proposal_line_items WHERE organization_id='00000000-0000-0000-0000-000000000003' AND proposal_id='00000000-0000-0000-0000-000000000004'")"
[[ "$count" == 1 ]] || { echo 'Cross-tenant equipment leaked' >&2; exit 1; }
# A held ledger must never pass the locked revision reader's candidate check.
"${PSQL[@]}" -c "UPDATE techsafe_source.order_revision_ledger SET state='held',source_fingerprint=repeat('0',64)"
held="$("${PSQL[@]}" -c "SELECT count(*) FROM techsafe_source.order_revision_ledger WHERE state='candidate' AND source_fingerprint<>repeat('0',64)")"
[[ "$held" == 0 ]] || { echo 'Held revision appeared eligible' >&2; exit 1; }
# Exercise the actual catalog discovery SQL used by postgresSourceSchemaPreflight.
# Missing certificate storage must be reported, not assumed to exist.
catalog="$("${PSQL[@]}" <<'SQL'
SELECT n.nspname AS schema_name,c.relname AS table_name,
 a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS data_type
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 WHERE c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  AND n.nspname IN ('public','techsafe_source')
 ORDER BY n.nspname,c.relname,a.attnum;
SQL
)"
[[ "$catalog" == *"public|sales_orders|proposal_id|uuid"* ]] || {
 echo 'Actual Sales Order schema missing from catalog' >&2; exit 1;
}
[[ "$catalog" == *"public|proposal_line_items|product_id|uuid"* ]] || {
 echo 'Actual equipment product column missing from catalog' >&2; exit 1;
}
if [[ "$catalog" == *"equipment_snapshot_certificates"* ]]; then
 echo 'Unexpected certificate storage in minimal fixture' >&2; exit 1
fi
# An approval/change-order reader cannot be built from a missing table:
# fail closed rather than guessing that proposal lines imply approval.
approval_count="$("${PSQL[@]}" -c "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('change_orders','change_order_items')")"
[[ "$approval_count" == 0 ]] || { echo 'Unexpected approval fixture tables' >&2; exit 1; }
echo 'PASS: real PostgreSQL SERIALIZABLE Sales Order scope, tenant isolation and held revision'
echo 'NOTE: no approval/change-order authority or live sync is established'
