import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {prepareOrderContent} from '../../supabase/functions/_shared/techsafe-order-content.mjs';
const input=()=>({organizationId:'org-1',currency:'USD',minimumUnitValueCents:50000,
 order:{id:'order-1',organization_id:'org-1',proposal_id:'proposal-1',contact_id:'customer-1',status:'active'},
 customer:{id:'customer-1',organization_id:'org-1',full_name:'José & Company',company_name:'Another display',email:'private@example.invalid'},
 lines:[{line:{id:'line-1',organization_id:'org-1',proposal_id:'proposal-1',product_id:'product-1',item_type:'material',quantity:'1.00',is_customer_supplied:false,description:'Equipment'},
  product:{id:'product-1',organization_id:'org-1',item_type:'material',sku:'TV-1',name:'Television',cost:1,retail_price:1000},
  exclusion:null,membership:{sourceLineId:'line-1',orderId:'order-1',verified:true,scope:'included'},unitSalePrice:'800.00',salesPriceResolved:true}]});
const source=input(),prepared=prepareOrderContent(source);
assert.equal(prepared.content.customerName,'José & Company');assert.equal(prepared.content.customerRef,'customer-1');assert.equal(prepared.content.siteRef,'order-1');
assert.equal(prepared.content.lines[0].unitEquipmentValueCents,80000);assert.equal(prepared.content.orderStatus,'open');
assert.equal(prepared.snapshotReady,false);assert.equal(prepared.quoteReady,false);assert.equal(prepared.content.complete,undefined);assert.equal(prepared.content.scopeState,undefined);
source.customer.full_name='Changed';source.lines[0].unitSalePrice='1.00';assert.equal(prepared.content.customerName,'José & Company');assert.equal(prepared.content.lines[0].unitEquipmentValueCents,80000);
assert.throws(()=>{prepared.content.customerName='mutated';},TypeError);assert.throws(()=>{prepared.content.lines.push({});},TypeError);
for(const field of ['id','organization_id']){const source=input();source.customer[field]='other';assert.throws(()=>prepareOrderContent(source),/customer_binding_mismatch/);}
const reassigned=input();reassigned.order.contact_id='customer-2';assert.throws(()=>prepareOrderContent(reassigned),/customer_binding_mismatch/);
for(const full_name of [null,undefined,'','  ','x'.repeat(257),'Name\nCompany']){const source=input();source.customer.full_name=full_name;const result=prepareOrderContent(source);assert.equal(result.valid,false);assert.equal(result.content,null);}
const unicode=input();unicode.customer.full_name=' 李明 & O’Connor ';assert.equal(prepareOrderContent(unicode).content.customerName,' 李明 & O’Connor ');
for(const status of ['pending_deposit','pending_po','planning','active','complete','closed']){const source=input();source.order.status=status;assert.equal(prepareOrderContent(source).content.orderStatus,['complete','closed'].includes(status)?'completed':'open');}
const unknown=input();unknown.order.status='unknown';assert.throws(()=>prepareOrderContent(unknown),/unresolved_order_status/);
const site=input();site.site={id:'site-1',order_id:'order-1',organization_id:'org-1'};assert.equal(prepareOrderContent(site).content.siteRef,'site-1');site.site.order_id='other';assert.throws(()=>prepareOrderContent(site),/site_binding_mismatch/);
const unresolved=input();unresolved.lines[0].salesPriceResolved=false;assert.equal(prepareOrderContent(unresolved).content,null);
const empty=input();empty.lines[0].product.sku='MISC-ITEM';assert.deepEqual(prepareOrderContent(empty).content.lines,[]);
assert.equal(JSON.stringify(prepared.content).includes('private@example.invalid'),false);assert.equal(Object.hasOwn(prepared.content.lines[0],'cost'),false);
if(process.argv[2]){
 const {prepareImport}=await import(pathToFileURL(process.argv[2]).href);
 const binding={connectionId:'connection-1',sourceInstanceId:'mjv',organizationId:'org-1',environment:'sandbox',generation:1,dealerId:'dealer-1',status:'active',reconciliationRequired:false};
 const envelope={...prepared.content,environment:'sandbox',connectionId:'connection-1',sourceInstanceId:'mjv',generation:1,eventId:'event-1',revision:1,complete:true,scopeState:'committed'};
 const received=await prepareImport(envelope,binding,null);assert.equal(received.decision.action,'replace_draft');assert.equal(received.snapshot.customerName,'José & Company');
 const current={connectionId:'connection-1',dealerId:'dealer-1',orderId:'order-1',revision:1,contentHash:received.contentHash,lifecycle:'draft'};
 await assert.rejects(prepareImport({...envelope,customerName:'Renamed'},binding,current),e=>e.code==='revision_content_conflict');
 assert.equal((await prepareImport({...envelope,customerName:'Renamed',revision:2},binding,current)).decision.action,'replace_draft');
 assert.equal((await prepareImport({...envelope,customerName:'Renamed',revision:2},binding,{...current,lifecycle:'active'})).decision.action,'preserve_coverage_snapshot');
 console.log('Actual Techsafe v2 preparation accepted named source content, fingerprinted name changes and preserved active coverage. The complete envelope is synthetic test data only.');
}
console.log('Order-content checks passed: MJV display name, stable customer/order/site bindings, status mapping, detached sales-price lines, blocked unresolved context and no source/snapshot/quote authorization.');
