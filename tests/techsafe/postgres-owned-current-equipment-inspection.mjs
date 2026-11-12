import assert from 'node:assert/strict';
import {createOwnedCurrentEquipmentInspection} from '../../src/lib/techsafe/postgresOwnedCurrentEquipmentInspection.mjs';
const ids=Array.from({length:6},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [connectionId,orderId,organizationId,proposalId,lineId,productId]=ids;
function fixture({isolation='serializable',drift=false,price=true,readerThrows=false,approvalValid=true}={}){
 const queries=[],released=[];let revisions=0;
 const client={async query(sql){queries.push(sql);
  if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:isolation}]};
  if(sql.includes('integration_connections'))return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',enabled:true,status:'active'}]};
  if(sql.includes('order_revision_ledger')){revisions++;return {rows:[{organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',revision:String(drift&&revisions===3?4:3),state:'candidate',source_fingerprint:'a'.repeat(64)}]};}
  if(sql.includes('public.proposals p JOIN public.sales_orders so'))return {rows:approvalValid?[{
   id:proposalId,sales_order_id:orderId,status:'approved',approved_at:'2026-11-12',
   approval_completed_at:null,accepted_via_method:'portal',approved_by:ids[5],
   contact_id:ids[0],order_id:orderId,organization_id:organizationId,
   proposal_id:proposalId,order_contact_id:ids[0]
  }]:[]};
  if(sql.includes('LEFT JOIN public.change_order_history h'))return {rows:[]};
  if(sql.includes('FROM public.change_orders co'))return {rows:[]};
  if(sql.includes('public.sales_orders'))return {rows:[{id:orderId,organization_id:organizationId,proposal_id:proposalId}]};
  if(sql.includes('public.proposal_line_items'))return {rows:[{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:productId,quantity:2}]};
  if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  throw Error('unexpected SQL');},release(err){released.push(err)}};
 const pool={async connect(){return client}};
 const makeReader=provided=>{assert.equal(provided,client);return async ({client:again})=>{
  assert.equal(again,client);if(readerThrows)throw Error('private reader failed');
  return {trustedCurrentOrderRead:true,currentEquipmentComplete:true,approvedSalesOrder:true,
   organizationId,currency:'USD',order:{id:orderId,organization_id:organizationId,proposal_id:proposalId,contact_id:ids[0],status:'complete',project_id:null},
   customer:{id:ids[0],organization_id:organizationId,full_name:'Customer'},
   lines:[{line:{id:lineId,organization_id:organizationId,proposal_id:proposalId,product_id:productId,item_type:'material',quantity:'2.00',is_customer_supplied:false,description:'Current equipment'},
    product:{id:productId,organization_id:organizationId,item_type:'material',sku:'TV-1',name:'TV'},exclusion:null,
    membership:{sourceLineId:lineId,orderId,verified:true,scope:'included'},unitSalePrice:'750.00',salesPriceResolved:price}]
  };};};
 return {queries,released,run:createOwnedCurrentEquipmentInspection(pool,makeReader)};
}
const good=fixture(),result=await good.run({connectionId,orderId});
assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.lines[0].unitEquipmentValueCents,75000);
assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);assert.equal(result.quoteReady,false);
assert.equal(good.queries[0],'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
assert.equal(good.queries.at(-1),'COMMIT');assert.deepEqual(good.released,[undefined]);
for(const options of [{isolation:'read committed'},{drift:true},{price:false},{readerThrows:true},{approvalValid:false}]){
 const f=fixture(options);await assert.rejects(()=>f.run({connectionId,orderId}));
 assert.equal(f.queries.at(-1),'ROLLBACK');assert.equal(f.queries.includes('COMMIT'),false);
 assert.ok(f.released[0] instanceof Error);
}
const invalid=fixture();await assert.rejects(()=>invalid.run({connectionId:'invalid',orderId}));
assert.equal(invalid.queries.at(-1),'ROLLBACK');
console.log('PASS: owned SERIALIZABLE transaction commits inspected current equipment and rolls back held source');
