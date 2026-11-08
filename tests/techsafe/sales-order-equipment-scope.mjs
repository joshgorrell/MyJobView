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
// Every approved action has a resulting quantity; modifications must not bypass
// bounds/integer validation merely because they are not additions.
assert.match(sql,/OR \(li\.new_quantity IS NULL OR li\.new_quantity<0[\s\S]*?li\.new_quantity>10000\)\)/);
assert.ok(!sql.includes("li.action_type='add' AND (li.new_quantity"),'quantity checks cannot be add-only');
console.log('Sales Order equipment scope diagnostic remains private and non-authorizing');

// An internally approved change order is not proof of customer approval.
// Even when requires_customer_approval=false, the Techsafe diagnostic must
// hold scope until customer_approved=true is explicitly recorded.
assert.match(sql,/status IS DISTINCT FROM 'approved'\s+OR customer_approved IS DISTINCT FROM true/);
assert.match(sql,/status='approved' AND customer_approved=true/);
assert.match(sql,/AND co.customer_approved=true/);
assert.ok(!sql.includes('requires_customer_approval IS DISTINCT FROM true OR co.customer_approved=true'));
assert.ok(!sql.includes('requires_customer_approval=true AND customer_approved IS DISTINCT FROM true'));
