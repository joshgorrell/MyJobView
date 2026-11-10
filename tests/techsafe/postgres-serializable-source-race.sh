#!/usr/bin/env bash
# Disposable PostgreSQL only. Proves transaction-level revision races are rejected.
set -euo pipefail
: "${TECHSAFE_TEST_DATABASE_URL:?Provide an EMPTY disposable PostgreSQL database}"
command -v psql >/dev/null
DB="$TECHSAFE_TEST_DATABASE_URL"
PSQL=(psql "$DB" -X -qAt -v ON_ERROR_STOP=1)
existing="$("${PSQL[@]}" -c "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')")"
[[ "$existing" == "0" ]] || { echo "Refusing nonempty public schema" >&2; exit 2; }
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA techsafe_source;
CREATE TABLE public.proposal_line_items (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, proposal_id uuid NOT NULL,
 quantity integer NOT NULL
);
CREATE TABLE techsafe_source.integration_connections (
 connection_id uuid PRIMARY KEY, sales_order_id uuid NOT NULL,
 organization_id uuid NOT NULL, proposal_id uuid NOT NULL
);
CREATE TABLE techsafe_source.order_revision_ledger (
 connection_id uuid NOT NULL,sales_order_id uuid NOT NULL,
 organization_id uuid NOT NULL,proposal_id uuid NOT NULL,
 revision bigint NOT NULL,state text NOT NULL,hold_reason text,
 source_fingerprint text,updated_at timestamptz,
 PRIMARY KEY(connection_id,sales_order_id)
);
INSERT INTO techsafe_source.integration_connections VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
INSERT INTO techsafe_source.order_revision_ledger VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
  1,'candidate',NULL,repeat('a',64),now());
SQL
"${PSQL[@]}" -f supabase/migrations/20261108233000_techsafe_base_equipment_revision_invalidation.sql
"${PSQL[@]}" -c "INSERT INTO public.proposal_line_items VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',2)"
# Re-arm a candidate solely in this isolated test fixture.
"${PSQL[@]}" -c "UPDATE techsafe_source.order_revision_ledger SET state='candidate',revision=2,source_fingerprint=repeat('a',64)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Read a SERIALIZABLE source snapshot before concurrent source mutation, then
# attempt a ledger write after the mutation. PostgreSQL must abort the stale
# reader (SQLSTATE 40001); it must not commit an old source certificate.
(
 "${PSQL[@]}" >"$tmp/reader.out" 2>"$tmp/reader.err" <<'SQL'
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT quantity FROM public.proposal_line_items WHERE id='00000000-0000-0000-0000-000000000005';
SELECT revision FROM techsafe_source.order_revision_ledger WHERE connection_id='00000000-0000-0000-0000-000000000001';
SELECT pg_sleep(2);
UPDATE techsafe_source.order_revision_ledger SET updated_at=clock_timestamp()
 WHERE connection_id='00000000-0000-0000-0000-000000000001';
COMMIT;
SQL
) &
reader=$!
sleep 0.5
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET quantity=3 WHERE id='00000000-0000-0000-0000-000000000005'"
if wait "$reader"; then
 echo 'ERROR: stale SERIALIZABLE source transaction unexpectedly committed' >&2; exit 1
fi
grep -q 'could not serialize access due to concurrent update' "$tmp/reader.err" || {
 cat "$tmp/reader.err" >&2; echo 'ERROR: expected PostgreSQL serialization failure' >&2; exit 1;
}
state="$("${PSQL[@]}" -c "SELECT revision || ':' || state || ':' || source_fingerprint FROM techsafe_source.order_revision_ledger")"
[[ "$state" == "3:held:$(printf '0%.0s' {1..64})" ]] || {
 echo "ERROR: concurrent mutation did not invalidate ledger: $state" >&2; exit 1;
}
# A fresh transaction must see the new equipment and the held revision.
fresh="$("${PSQL[@]}" -c "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT quantity FROM public.proposal_line_items WHERE id='00000000-0000-0000-0000-000000000005'; SELECT revision || ':' || state FROM techsafe_source.order_revision_ledger; COMMIT;")"
[[ "$fresh" == *"3:held"* ]] || { echo "ERROR: fresh transaction missed hold: $fresh" >&2; exit 1; }
echo 'PASS: concurrent approved equipment mutation aborts stale SERIALIZABLE transaction, invalidates ledger and is visible on fresh read'
echo 'NOTE: This test does not create or authorize certificates; real source reader and writer still require review.'
