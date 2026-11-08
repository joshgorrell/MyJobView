import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261108150000_techsafe_private_order_revision_ledger.sql',import.meta.url),'utf8');
for(const pattern of [
 /CREATE TABLE techsafe_source\.order_revision_ledger/,
 /PRIMARY KEY \(connection_id,sales_order_id\)/,
 /CHECK \(revision >= 1\)/,
 /CHECK \(connection_generation >= 1\)/,
 /FOR UPDATE/,
 /pg_advisory_xact_lock/,
 /p_expected_revision IS DISTINCT FROM old_row.revision/,
 /p_expected_generation IS DISTINCT FROM old_row.connection_generation/,
 /p_next_generation<old_row.connection_generation/,
 /p_next_state <> 'held'/,
 /IF p_next_state='candidate' THEN[\s\S]*?RETURN NULL;/,
 /REVOKE ALL ON techsafe_source\.order_revision_ledger FROM PUBLIC,anon,authenticated,service_role/,
 /REVOKE ALL ON FUNCTION techsafe_source\.cas_order_revision/,
])assert.match(sql,pattern);
assert.doesNotMatch(sql,/CREATE TRIGGER|GRANT (SELECT|INSERT|UPDATE|EXECUTE)|INSERT INTO public\.|UPDATE public\./i);
console.log('Private held-only revision ledger static safety checks passed (not a database execution test)');
