import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261108233000_techsafe_base_equipment_revision_invalidation.sql',import.meta.url),'utf8');
for(const pattern of [
 /AFTER INSERT OR UPDATE OR DELETE ON public\.proposal_line_items/,
 /prior_proposal:=OLD\.proposal_id; prior_org:=OLD\.organization_id/,
 /next_proposal:=NEW\.proposal_id; next_org:=NEW\.organization_id/,
 /c\.sales_order_id=l\.sales_order_id/,
 /c\.organization_id=l\.organization_id/,
 /c\.proposal_id=l\.proposal_id/,
 /c\.proposal_id=prior_proposal AND c\.organization_id=prior_org/,
 /c\.proposal_id=next_proposal AND c\.organization_id=next_org/,
 /revision=CASE WHEN l\.revision<9223372036854775807 THEN l\.revision\+1/,
 /state='held'/,
 /source_fingerprint=repeat\('0',64\)/,
 /REVOKE ALL ON FUNCTION techsafe_source\.invalidate_base_equipment_source/
])assert.match(sql,pattern);
assert.doesNotMatch(sql,/GRANT EXECUTE|authorized',true|snapshotReady',true/i);
console.log('Base equipment revision invalidation SQL static contract: PASS (PostgreSQL concurrency unverified)');
