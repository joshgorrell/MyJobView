import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261108223000_techsafe_locked_equipment_source_inspection.sql',import.meta.url),'utf8');
for(const required of [
 'SECURITY INVOKER',
 'FROM techsafe_source.integration_connections',
 'FROM techsafe_source.order_revision_ledger',
 'FOR UPDATE',
 "l.state IS DISTINCT FROM 'candidate'",
 "'unapproved_change_order_count'",
 "'cross_tenant_change_line_count'",
 "'authorized',false,'snapshotReady',false",
 'REVOKE ALL ON FUNCTION techsafe_source.inspect_locked_equipment_source'
]) assert.ok(sql.includes(required),`Missing source inspection safeguard: ${required}`);
assert.ok(!/GRANT EXECUTE/i.test(sql),'Private inspection must not expose RPC access');
assert.ok(!/['\"]valid['\"],true/i.test(sql),'Diagnostic cannot claim verified source validity');
assert.ok(sql.includes("'inspected',true"),'Diagnostic should distinguish inspected from certified');
assert.ok(!/authorized',true/i.test(sql),'Inspection must never authorize delivery');
console.log('Locked equipment source SQL static contract: PASS (not PostgreSQL runtime verified)');
