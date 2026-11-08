import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261108194000_techsafe_sales_order_equipment_scope_inspection.sql','utf8');
for(const phrase of ['inspect_sales_order_source','public.proposal_line_items','public.change_orders','public.change_order_line_items','sales_order_id=c.sales_order_id','organization_id=c.organization_id','requires_customer_approval','customer_approved','scopeVerified\',false','snapshotReady\',false','REVOKE ALL'])assert.ok(sql.includes(phrase),phrase);
assert.ok(!sql.includes("'scopeVerified',true"));
assert.ok(!sql.includes("'snapshotReady',true"));
console.log('Sales Order equipment scope diagnostic remains private and non-authorizing');
