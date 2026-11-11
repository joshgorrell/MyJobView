import assert from 'node:assert/strict';
import {snapshotChangeOrderLines as snap} from '../../supabase/functions/_shared/change-order-committed-source-snapshot.mjs';
const co='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',prod='44444444-4444-4444-8444-444444444444';
const row={id,change_order_id:co,organization_id:org,action_type:'add',product_id:prod,item_type:'material',new_quantity:'6',new_unit_price:'250.00',new_total:'1500.00',labor_hours:'1.5',labor_rate:'125.50',labor_total:'188.25'};
const one=snap({changeOrderId:co,organizationId:org,rows:[row]});
assert.equal(one[0].newQuantity,'6');
assert.equal(one[0].newTotalCents,'150000');
assert.equal(one[0].laborTotalCents,'18825');
assert.equal(one[0].laborHours,'1.5');
assert.deepEqual(one,snap({changeOrderId:co,organizationId:org,rows:[row]}));
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[row,row]}),/Duplicate/);
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[{...row,organization_id:co}]}),/Cross-order/);
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[{...row,new_unit_price:'1.234'}]}),/currency/);
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[{...row,action_type:'modify_quantity'}]}),/original proposal line/);
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[{...row,product_id:null}]}),/catalog product/);
for(const action of ['remove','modify_quantity','modify_price','modify_labor']) {
  const original='55555555-5555-4555-8555-555555555555';
  const parsed=snap({changeOrderId:co,organizationId:org,rows:[{...row,action_type:action,proposal_line_item_id:original}]});
  assert.equal(parsed[0].action,action);
  assert.equal(parsed[0].proposalLineItemId,original);
}
assert.equal(snap({changeOrderId:co,organizationId:org,rows:[{...row,action_type:'modify_modifiers',product_id:null}]}).length,1);
assert.throws(()=>snap({changeOrderId:co,organizationId:org,rows:[{...row,action_type:'modify'}]}),/Unsupported/);
console.log('Change-order source snapshot tests passed');
