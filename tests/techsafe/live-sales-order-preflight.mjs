import assert from 'node:assert/strict';
import {createLiveSalesOrderPreflight} from '../../supabase/functions/_shared/techsafe-live-sales-order-preflight.mjs';
const c='11111111-1111-4111-8111-111111111111',o='22222222-2222-4222-8222-222222222222',org='33333333-3333-4333-8333-333333333333';
const row={binding:{connection_id:c,sales_order_id:o,organization_id:org,proposal_status:'approved',approved_at:'2026-01-01',full_name:'Customer'},lines:[{id:'l',product_id:'p',product_organization_id:org,quantity:1,unit_price:100}],changes:[],line_count:1,change_count:0};
let seen;
const inspect=createLiveSalesOrderPreflight({query:async(sql,params)=>{seen={sql,params};return {rows:[row]};}});
assert.deepEqual((await inspect({connectionId:c,orderId:o})).reason,'source_certificate_and_revision_required');
assert.deepEqual(seen.params,[c,o]);assert.match(seen.sql,/public\\.proposal_line_items/);assert.match(seen.sql,/public\\.sales_orders/);
for(const [change,reason] of [[{binding:{...row.binding,proposal_status:'draft'}},'source_incomplete'],[{lines:[{...row.lines[0],product_organization_id:o}]},'cross_tenant_product'],[{changes:[{status:'approved',is_active:true,approval_date:'2026-01-02'}],change_count:1},'change_order_application_unverified'],[{lines:[{...row.lines[0],unit_price:null}]},'line_price_or_quantity_unresolved'],[{binding:{...row.binding,approved_at:null}},'approval_evidence_unavailable']]){
 const check=createLiveSalesOrderPreflight({query:async()=>({rows:[{...row,...change}]})});
 assert.equal((await check({connectionId:c,orderId:o})).reason,reason);
}
for(const state of ['draft','pending_approval']){
 const check=createLiveSalesOrderPreflight({query:async()=>({rows:[{...row,changes:[{status:state,is_active:true}],change_count:1}]})});
 assert.equal((await check({connectionId:c,orderId:o})).reason,'source_certificate_and_revision_required');
}
const applied=createLiveSalesOrderPreflight({query:async()=>({rows:[{...row,changes:[{status:'approved',is_active:false,approval_date:'2026-01-02',requires_customer_approval:false}],change_count:1}]})});
assert.equal((await applied({connectionId:c,orderId:o})).reason,'source_certificate_and_revision_required');
assert.equal((await inspect({connectionId:'bad',orderId:o})).reason,'invalid_binding');
assert.equal((await createLiveSalesOrderPreflight({query:async()=>{throw Error('private');}})({connectionId:c,orderId:o})).reason,'source_read_failed');
console.log('Live Sales Order preflight holds until trusted source certificate');
