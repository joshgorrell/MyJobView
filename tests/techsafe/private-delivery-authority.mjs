import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261108193000_techsafe_private_delivery_authority_inspection.sql','utf8');
for(const phrase of ['SECURITY INVOKER','FOR UPDATE','inspect_sales_order_source','approved_proposal_id','source_fingerprint','connection_generation','revision_not_candidate','snapshot_scope_certificate_not_implemented','REVOKE ALL'])assert.ok(sql.includes(phrase),phrase);
assert.ok(!sql.includes("'authorized',true"),'No premature authority issuance');
console.log('Private delivery authority verifier static fail-closed checks passed');
