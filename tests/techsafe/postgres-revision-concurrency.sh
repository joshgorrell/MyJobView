#!/usr/bin/env bash
# Run ONLY against an empty, disposable PostgreSQL database.
# Example: TECHSAFE_TEST_DATABASE_URL=postgres://... bash tests/techsafe/postgres-revision-concurrency.sh
set -euo pipefail
: "${TECHSAFE_TEST_DATABASE_URL:?Set TECHSAFE_TEST_DATABASE_URL to an EMPTY disposable PostgreSQL database}"
command -v psql >/dev/null || { echo 'psql is required' >&2; exit 2; }
DB="$TECHSAFE_TEST_DATABASE_URL"
PSQL=(psql "$DB" -X -v ON_ERROR_STOP=1 -qAt)
existing="$("${PSQL[@]}" -c "SELECT count(*) FROM pg_class WHERE relnamespace IN ('public'::regnamespace) AND relkind IN ('r','p')")"
if [[ "$existing" != "0" ]]; then echo 'Refusing nonempty public schema' >&2; exit 2; fi
"${PSQL[@]}" <<'SQL'
-- Supabase migrations revoke privileges from these predefined API roles.
-- Disposable vanilla PostgreSQL does not provide them by default.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
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
 connection_id uuid NOT NULL, sales_order_id uuid NOT NULL,
 organization_id uuid NOT NULL, proposal_id uuid NOT NULL,
 revision bigint NOT NULL, state text NOT NULL, hold_reason text,
 source_fingerprint text, updated_at timestamptz,
 PRIMARY KEY (connection_id,sales_order_id)
);
INSERT INTO techsafe_source.integration_connections VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000014');
INSERT INTO techsafe_source.order_revision_ledger
 SELECT connection_id,sales_order_id,organization_id,proposal_id,1,'candidate',NULL,repeat('a',64),now()
 FROM techsafe_source.integration_connections;
SQL
"${PSQL[@]}" -f supabase/migrations/20261108233000_techsafe_base_equipment_revision_invalidation.sql
assert_revision() {
 local connection="$1" expected="$2"
 local actual
 actual="$("${PSQL[@]}" -c "SELECT revision || ':' || state || ':' || source_fingerprint FROM techsafe_source.order_revision_ledger WHERE connection_id='$connection'")"
 [[ "$actual" == "$expected:held:$(printf '0%.0s' {1..64})" ]] || { echo "Unexpected ledger: $actual; expected revision $expected held and invalid fingerprint" >&2; exit 1; }
}
a=00000000-0000-0000-0000-000000000001
b=00000000-0000-0000-0000-000000000011
"${PSQL[@]}" -c "INSERT INTO public.proposal_line_items VALUES ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',2)"
assert_revision "$a" 2
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET quantity=3 WHERE id='00000000-0000-0000-0000-000000000021'"
assert_revision "$a" 3
# Reparenting must invalidate both old and new connected Sales Orders.
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET proposal_id='00000000-0000-0000-0000-000000000014' WHERE id='00000000-0000-0000-0000-000000000021'"
assert_revision "$a" 4
assert_revision "$b" 2
# Rollback must undo the ledger invalidation as well as the source mutation.
"${PSQL[@]}" <<'SQL'
BEGIN;
UPDATE public.proposal_line_items SET quantity=8;
ROLLBACK;
SQL
assert_revision "$b" 2
# Concurrent writers serialize ledger increments. Each mutation commits once.
"${PSQL[@]}" -c "BEGIN; UPDATE public.proposal_line_items SET quantity=4 WHERE id='00000000-0000-0000-0000-000000000021'; SELECT pg_sleep(2); COMMIT;" >/dev/null &
first=$!
sleep 0.3
"${PSQL[@]}" -c "INSERT INTO public.proposal_line_items VALUES ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000014',1)" >/dev/null &
second=$!
wait "$first"
wait "$second"
assert_revision "$b" 4
"${PSQL[@]}" -c "DELETE FROM public.proposal_line_items WHERE id='00000000-0000-0000-0000-000000000022'"
assert_revision "$b" 5
# An unrelated proposal must not touch either connected Sales Order ledger.
"${PSQL[@]}" -c "INSERT INTO public.proposal_line_items VALUES ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000099',1)"
assert_revision "$a" 4
assert_revision "$b" 5
# Reparent from an unlinked proposal to a connected Sales Order: only destination invalidates.
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET proposal_id='00000000-0000-0000-0000-000000000004' WHERE id='00000000-0000-0000-0000-000000000023'"
assert_revision "$a" 5
assert_revision "$b" 5
# Reparent to an unrelated proposal: only the previously linked source invalidates.
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET proposal_id='00000000-0000-0000-0000-000000000099' WHERE id='00000000-0000-0000-0000-000000000023'"
assert_revision "$a" 6
assert_revision "$b" 5
# At bigint exhaustion the trigger must hold and invalidate, never wrap to a negative revision.
"${PSQL[@]}" -c "UPDATE techsafe_source.order_revision_ledger SET revision=9223372036854775807,state='candidate',hold_reason=NULL,source_fingerprint=repeat('a',64) WHERE connection_id='$a'"
"${PSQL[@]}" -c "UPDATE public.proposal_line_items SET quantity=5 WHERE id='00000000-0000-0000-0000-000000000021'" >/dev/null
assert_revision "$a" 9223372036854775807
reason="$("${PSQL[@]}" -c "SELECT hold_reason FROM techsafe_source.order_revision_ledger WHERE connection_id='$a'")"
[[ "$reason" == "revision_exhausted" ]] || { echo "Expected revision_exhausted, got $reason" >&2; exit 1; }
echo 'PASS: linked base equipment insert/update/reparent/rollback/concurrent writers/delete/unlinked scope/bigint exhaustion'
echo 'NOTE: Fixture verifies trigger behavior only; not the full application migration chain, customer approval or snapshot certification.'
