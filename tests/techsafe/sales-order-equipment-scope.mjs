import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261108194000_techsafe_sales_order_equipment_scope_inspection.sql','utf8');
for(const phrase of ['inspect_sales_order_source','public.proposal_line_items','public.change_orders','public.change_order_line_items','sales_order_id=c.sales_order_id','organization_id=c.organization_id','requires_customer_approval','customer_approved','scopeVerified\',false','snapshotReady\',false','REVOKE ALL'])assert.ok(sql.includes(phrase),phrase);
assert.ok(!sql.includes("'scopeVerified',true"));
assert.ok(!sql.includes("'snapshotReady',true"));
// The production change-order schema uses modify_quantity and modify_price,
// not a generic 'modify' action. A mismatch silently marks legitimate changes
// unsupported, preventing useful diagnostic reconciliation.
const changeOrderSchema=readFileSync('supabase/migrations/20251204192059_create_comprehensive_change_order_system.sql','utf8');
for(const action of ['add','remove','modify_quantity','modify_price']){
 assert.ok(changeOrderSchema.includes("'"+action+"'"),'schema action '+action);
 assert.ok(sql.includes("'"+action+"'"),'inspection action '+action);
}
assert.ok(!sql.includes("'modify'"),'nonexistent generic modify action');
console.log('Sales Order equipment scope diagnostic remains private and non-authorizing');
