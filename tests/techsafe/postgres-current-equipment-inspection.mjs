import assert from 'node:assert/strict';
import {createTransactionalCurrentEquipmentInspection} from '../../src/lib/techsafe/postgresCurrentEquipmentInspection.mjs';
const ids=Array.from({length:6},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [connectionId,orderId,organizationId,proposalId,lineId,productId]=ids;
const scope={connectionId,orderId};
function fixture({changeRevision=false,quantity='2.00',product=productId,missingPrice=false,missingMembership=false,raw=false,missingLine=false,approvalValid=true}={}){
 let reads=0,contentReads=0;const calls=[];
 const client={async query(sql){calls.push(sql);
  if(sql.includes('SHOW transaction_isolation'))return {rows:[{transaction_isolation:'serializable'}]};
  if(sql.includes('integration_connections'))return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',enabled:true,status:'active'}]};
  if(sql.includes('order_revision_ledger')){reads++;return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',revision:String(changeRevision&&reads===3?4:3),state:'candidate',source_fingerprint:'a'.repeat(64)}]};}
  if(sql.includes('public.proposals p JOIN public.sales_orders so'))return {rows:approvalValid?[{
   id:proposalId,sales_order_id:orderId,status:'approved',approved_at:'2026-11-12',
   approval_completed_at:null,accepted_via_method:'portal',approved_by:ids[5],
   contact_id:ids[0],order_id:orderId,organization_id:organizationId,
   proposal_id:proposalId,order_contact_id:ids[0]
  }]:[]};
  if(sql.includes('FROM public.change_order_line_items coli'))return {rows:[]};
  if(sql.includes('FROM public.change_orders co'))return {rows:[]};
  if(sql.includes('public.sales_orders'))return {rows:[{id:orderId,organization_id:organizationId,proposal_id:proposalId}]};
  if(sql.includes('public.proposal_line_items'))return {rows:[{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:productId,quantity:2}]};
  throw Error('unexpected SQL');}};
 const reader=async ({client:provided})=>{assert.equal(provided,client);contentReads++;return {
  ...(raw?{readModelVersion:1}:{}),trustedCurrentOrderRead:true,currentEquipmentComplete:true,approvedSalesOrder:true,
  organizationId,currency:'USD',order:{id:orderId,organization_id:organizationId,proposal_id:proposalId,contact_id:ids[0],status:'complete',project_id:null},
  customer:{id:ids[0],organization_id:organizationId,full_name:'Customer'},
  lines:missingLine?[]:[{line:{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:product,item_type:'material',quantity,is_customer_supplied:false,description:'Current equipment'},
   product:{id:productId,organization_id:organizationId,item_type:'material',sku:'TV-1',name:'TV'},exclusion:null,
   membership:{sourceLineId:lineId,orderId,verified:!missingMembership,scope:'included'},unitSalePrice:'750.00',salesPriceResolved:!missingPrice}]
 };};
 return {calls,run:createTransactionalCurrentEquipmentInspection(client,reader),getReads:()=>contentReads};
}
const f=fixture(),good=await f.run(scope);
assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.lines.length,1);
assert.equal(good.lines[0].quantity,2);assert.equal(good.lines[0].unitEquipmentValueCents,75000);
assert.equal(good.baseLinesAreCurrent,true);
for(const flag of ['authorized','snapshotReady','quoteReady'])assert.equal(good[flag],false);
assert.equal(f.calls.filter(x=>x.includes('order_revision_ledger')).length,3);
assert.equal(f.calls.filter(x=>x.includes('FOR UPDATE')).length,6);
for(const [options,reason] of [
 [{quantity:'3.00'},'current_equipment_rows_differ_from_locked_scan'],
 [{product:ids[0]},'current_equipment_rows_differ_from_locked_scan'],
 [{missingLine:true},'private_current_content_unverified'],
 [{missingPrice:true},'current_sales_order_equipment_incomplete'],
 [{missingMembership:true},'current_sales_order_equipment_incomplete'],
 [{raw:true},'private_current_content_unverified'],
 [{approvalValid:false},'approved_sales_order_binding_missing'],
 [{changeRevision:true},'current_equipment_revision_changed']
 ]){const x=fixture(options),r=await x.run(scope);assert.equal(r.reason,reason,JSON.stringify({options,r}));assert.equal(r.authorized,false);assert.equal(r.snapshotReady,false);}
assert.equal((await fixture().run({connectionId:'wrong',orderId})).ok,false);
console.log('PASS: serializable locked MJV current equipment + native projection; no CO replay or export authorization');
