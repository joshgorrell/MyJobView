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
function reader({rows=sourceRows,approved=true,isolation='serializable'}={}){
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
assert.equal(queries.some(x=>/\bFROM\s+(?:public\.)?change_orders\b|\bFROM\s+(?:public\.)?change_order_line_items\b|\bJOIN\s+(?:public\.)?change_orders\b/i.test(x.sql)),false);
assert.equal((await reader({approved:false}).read(scope)).ok,false);
assert.equal((await reader({isolation:'read committed'}).read(scope)).ok,false);
const unknown=await reader({rows:[{...sourceRows[0],labor_total:null}]}).read(scope);
assert.equal(unknown.soldLaborCents,0);
assert.ok(unknown.issues.some(x=>x.reason==='labor_amount_unresolved'));
const hidden=await reader({rows:[{...sourceRows[0],is_hidden:true}]}).read(scope);
assert.equal(hidden.equipment.length,1);
assert.equal(hidden.soldLaborCents,33750);
assert.equal(hidden.issues.length,0);
const supplied=await reader({rows:[{...sourceRows[0],is_customer_supplied:true}]}).read(scope);
assert.equal(supplied.equipment.length,0);
assert.equal(supplied.soldLaborCents,0);
console.log('PASS: current Sales Order preview reads sold unit prices and all labor without change-order history or transport authorization');
