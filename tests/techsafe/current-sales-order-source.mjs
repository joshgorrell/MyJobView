import assert from 'node:assert/strict';
import {createCurrentSalesOrderSourceReader} from '../../src/lib/techsafe/postgresCurrentSalesOrderSource.mjs';
const ids=Array.from({length:8},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [orderId,organizationId,proposalId,contactId,line1,line2,productId,line3]=ids;
const scope={orderId,organizationId,proposalId};
const sourceRows=[
 {id:line1,organization_id:organizationId,proposal_id:proposalId,product_id:productId,
 quantity:1,item_type:'material',unit_price:'299.95',line_total:'637.45',
 labor_total:'337.50',committed_change_order_line_id:null,is_hidden:false,is_customer_supplied:false},
 {id:line2,organization_id:organizationId,proposal_id:proposalId,product_id:null,
 quantity:1,item_type:'labor',unit_price:'0',line_total:'200.00',
 labor_total:'200.00',committed_change_order_line_id:null,is_hidden:false,is_customer_supplied:false},
 {id:line3,organization_id:organizationId,proposal_id:proposalId,product_id:productId,
 quantity:4,item_type:'material',unit_price:'100.00',line_total:'400.00',
 labor_total:'0',committed_change_order_line_id:null,is_hidden:false,is_customer_supplied:false}
];
function reader({rows=sourceRows,approved=true,isolation='serializable',removed=[]}={}){
 const queries=[];
 const client={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.startsWith('SHOW'))return {rows:[{transaction_isolation:isolation}]};
  if(sql.includes('FROM public.proposals p JOIN public.sales_orders so'))
   return {rows:approved?[{id:proposalId,sales_order_id:orderId,order_id:orderId,
    organization_id:organizationId,proposal_id:proposalId,contact_id:contactId,
    order_contact_id:contactId,approved_at:'2026-11-12T00:00:00Z',status:'approved'}]:[]};
  if(sql.includes('FROM public.sales_orders'))return {rows:[{id:orderId,organization_id:organizationId,proposal_id:proposalId}]};
  if(sql.includes('FROM public.proposal_line_items'))return {rows};
  if(sql.includes('FROM public.change_order_line_items'))return {rows:removed.map(removed_line_id=>({removed_line_id}))};
  throw Error('unexpected query: '+sql);
 }};
 return {read:createCurrentSalesOrderSourceReader(client),queries};
}
const {read,queries}=reader();
const current=await read(scope);
assert.equal(current.ok,true);
assert.equal(current.authorized,false);
assert.equal(current.snapshotReady,false);
assert.equal(current.soldLaborCents,53750);
assert.equal(current.equipment.length,2);
assert.equal(current.equipment[0].unitSalePriceCents,29995);
assert.equal(current.equipment[0].lineSaleTotalCents,63745);
assert.equal(current.equipment[1].quantity,4);
assert.equal(current.equipment[1].unitSalePriceCents,10000);
assert.equal(current.pendingEditExclusionVerified,false);
assert.equal(current.noChangeOrderReplay,true);
assert.equal(queries.some(x=>x.sql.includes("action_type='remove'")),true);
assert.equal((await reader({approved:false}).read(scope)).ok,false);
assert.equal((await reader({isolation:'read committed'}).read(scope)).ok,false);
const unknown=await reader({rows:[{...sourceRows[0],labor_total:null}]}).read(scope);
assert.equal(unknown.soldLaborCents,0);
assert.ok(unknown.issues.some(x=>x.reason==='labor_amount_unresolved'));
const hidden=await reader({rows:[{...sourceRows[0],is_hidden:true}]}).read(scope);
assert.equal(hidden.equipment.length,1);
assert.equal(hidden.soldLaborCents,33750);
assert.equal(hidden.issues.length,0);
const removedLine=await reader({rows:[{...sourceRows[0],is_hidden:true},sourceRows[1]],removed:[line1]}).read(scope);
assert.equal(removedLine.ok,true);
assert.equal(removedLine.equipment.length,0);
assert.equal(removedLine.soldLaborCents,20000);
assert.equal(removedLine.approvedRemovalCount,1);
const mismatch=await reader({rows:[sourceRows[0]],removed:[line1]}).read(scope);
assert.equal(mismatch.ok,false);
assert.equal(mismatch.reason,'approved_removal_not_reflected_in_current_lines');
const supplied=await reader({rows:[{...sourceRows[0],is_customer_supplied:true}]}).read(scope);
assert.equal(supplied.equipment.length,0);
assert.equal(supplied.soldLaborCents,0);
console.log('PASS: current Sales Order preview reads sold unit prices and all labor without change-order history or transport authorization');

// Ad-hoc approved additions can be material without a catalog product ID.
const manualRow={...sourceRows[0],product_id:null,description:'85-inch QLED TV',unit_price:'1999.95'};
const manual=await reader({rows:[manualRow,sourceRows[1]]}).read(scope);
assert.equal(manual.ok,true);
assert.equal(manual.issues.length,0);
assert.equal(manual.equipment.length,1);
assert.equal(manual.equipment[0].productRef,`line_${line1}`);
assert.equal(manual.equipment[0].description,'85-inch QLED TV');
assert.equal(manual.soldLaborCents,53750);
const {prepareCurrentSalesOrderTechsafeSnapshot}=await import('../../supabase/functions/_shared/techsafe-current-order-snapshot.mjs');
const mapped=prepareCurrentSalesOrderTechsafeSnapshot({source:manual,
 connection:{connectionId:line3,...scope,generation:1},revision:1,eventId:line2,
 sourceInstanceId:'mjv',customerName:'Test Customer',siteRef:'site',minimumUnitValueCents:25000});
assert.equal(mapped.ready,true);
assert.equal(mapped.snapshot.lines[0].description,'85-inch QLED TV');
assert.equal(mapped.snapshot.lines[0].productRef,`line_${line1}`);
assert.equal(mapped.snapshot.lines[0].unitEquipmentValueCents,199995);
for(const description of [null,'',' '.repeat(2),'x'.repeat(4001)]){
 const invalid=await reader({rows:[{...manualRow,description}]}).read(scope);
 assert.ok(invalid.issues.some(x=>x.reason==='manual_equipment_description_unresolved'));
}
const unknownType=await reader({rows:[{...manualRow,item_type:'both'}]}).read(scope);
assert.ok(unknownType.issues.some(x=>x.reason==='product_type_or_split_unverified'));
const manualRemoved=await reader({rows:[{...manualRow,is_hidden:true}],removed:[line1]}).read(scope);
assert.equal(manualRemoved.equipment.length,0);
assert.equal(manualRemoved.soldLaborCents,0);
