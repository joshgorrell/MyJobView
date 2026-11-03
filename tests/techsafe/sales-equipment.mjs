import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {prepareSalesEquipment,salesPriceToCents} from '../../supabase/functions/_shared/techsafe-sales-equipment.mjs';
const row=(changes={})=>({line:{id:'line-1',organization_id:'org-1',proposal_id:'proposal-1',product_id:'product-1',item_type:'material',quantity:'1.00',is_customer_supplied:false,description:'Sold equipment'},
 product:{id:'product-1',organization_id:'org-1',item_type:'material',sku:'TV-1',name:'Television',cost:100,retail_price:1500},
 exclusion:null,membership:{verified:true,scope:'included',orderId:'order-1',sourceLineId:'line-1'},unitSalePrice:'800.00',salesPriceResolved:true,...changes});
const input=(lines=[row()],minimumUnitValueCents=50000)=>({organizationId:'org-1',orderId:'order-1',proposalId:'proposal-1',minimumUnitValueCents,lines});
const select=(r,minimum=50000)=>prepareSalesEquipment(input([r],minimum));
assert.equal(select(row()).equipment[0].unitEquipmentValueCents,80000);
for(const cost of [0,1,499,500,5000,null,undefined,'invalid']){
 const r=row();r.product.cost=cost;r.line.cost=cost;r.product.retail_price=99999;r.line.unit_price=1;
 assert.deepEqual(select(r),select(row()),'Only the resolved sold price may affect exported values');
}
const costTrap=row();Object.defineProperty(costTrap.product,'cost',{get(){throw new Error('COST READ');}});Object.defineProperty(costTrap.line,'cost',{get(){throw new Error('COST READ');}});
assert.equal(select(costTrap).equipment[0].unitEquipmentValueCents,80000);
for(const [price,qty,count] of [['499.99','1.00',0],['500.00','1.00',1],['500.01','1.00',1],['100.00','10.00',0]]){
 const r=row({unitSalePrice:price});r.line.quantity=qty;assert.equal(select(r).equipment.length,count);
}
const both=row();both.line.item_type='both';both.line.labor_total=5000;both.line.tax_amount=700;
both.line.service_call_fee=95;both.line.margin=0.9;
assert.equal(select(both).equipment[0].unitEquipmentValueCents,80000);
for(const kind of ['labor','miscellaneous','optout','non-product','removed','supplied']){
 const r=row({unitSalePrice:'5000.00'});
 if(kind==='labor')r.line.item_type='labor';
 if(kind==='miscellaneous')r.product.sku=' MISC-ITEM ';
 if(kind==='optout')r.exclusion={product_id:'product-1',organization_id:'org-1',excluded:true,miscellaneous_placeholder:false};
 if(kind==='non-product'){r.line.product_id=null;r.product=null;}
 if(kind==='removed')r.membership={verified:true,scope:'removed',orderId:'order-1',sourceLineId:r.line.id};
 if(kind==='supplied')r.line.is_customer_supplied=true;
 const result=select(r);assert.equal(result.equipment.length,0);assert.equal(result.valid,true);assert.equal(result.excluded.length,1);
}
const sticky=row();sticky.product.sku='RENAMED';sticky.product.name='Expensive television';sticky.exclusion={product_id:'product-1',organization_id:'org-1',excluded:false,miscellaneous_placeholder:true};
assert.equal(select(sticky).excluded[0].reason,'miscellaneous');
const namedMisc=row({unitSalePrice:'5000.00'});namedMisc.product.sku='CUSTOM';namedMisc.product.name=' Miscellaneous Item ';
assert.equal(select(namedMisc).excluded[0].reason,'miscellaneous');
namedMisc.line.id='misc-line';namedMisc.membership.sourceLineId='misc-line';namedMisc.line.product_id='misc-product';namedMisc.product.id='misc-product';
const reversible=row();reversible.exclusion={product_id:'product-1',organization_id:'org-1',excluded:false,miscellaneous_placeholder:false};assert.equal(select(reversible).equipment.length,1);
const hidden=row();hidden.line.is_hidden=true;assert.equal(select(hidden).equipment.length,1);
for(const change of [
 {membership:{verified:false,scope:'included'}},{membership:{verified:true,scope:'unverified'}},
 {salesPriceResolved:false},{unitSalePrice:undefined},{unitSalePrice:'500.001'},
 {product:null}
]){const validRow=row();validRow.line.id='valid-line';validRow.membership.sourceLineId='valid-line';validRow.line.product_id='valid-product';validRow.product.id='valid-product';const result=prepareSalesEquipment(input([validRow,row(change)]));assert.equal(result.valid,false);assert.deepEqual(result.equipment,[]);assert.ok(result.issues.length);}
for(const amount of ['-1','NaN','Infinity','1e3',' 500','500.001',null,Infinity])assert.throws(()=>salesPriceToCents(amount));
assert.equal(salesPriceToCents('0.29'),29);assert.equal(salesPriceToCents(499.99),49999);
assert.equal(salesPriceToCents('500.0'),50000);assert.throws(()=>salesPriceToCents('99999999999999'),/overflow/);
for(const qty of ['1.5',-1,10001,null]){const r=row();r.line.quantity=qty;assert.equal(select(r).valid,false);}
const second=row();second.line={...second.line,id:'line-2'};second.membership.sourceLineId='line-2';
assert.equal(prepareSalesEquipment(input([row(),second])).equipment.length,2,'Identical separate source rows must not merge');
const inconsistent=row();inconsistent.line.id='line-2';inconsistent.membership.sourceLineId='line-2';inconsistent.exclusion={product_id:'product-1',organization_id:'org-1',excluded:true,miscellaneous_placeholder:false};
assert.throws(()=>prepareSalesEquipment(input([row(),inconsistent])),/inconsistent_product_facts/);
assert.throws(()=>prepareSalesEquipment(input([row(),row()])),/identity/);
for(const kind of ['line','product','exclusion']){
 const r=row();if(kind==='exclusion')r.exclusion={product_id:'product-1',organization_id:'other',excluded:false,miscellaneous_placeholder:false};else r[kind].organization_id='other';
 assert.throws(()=>select(r));
}
const output=select(row());assert.equal(output.snapshotReady,false);assert.equal(output.quoteReady,false);
assert.deepEqual(Object.keys(output.equipment[0]).sort(),['sourceLineId','productRef','productKind','scope','customerSupplied','techsafeExcluded','quantity','unitEquipmentValueCents','description'].sort());
// Optional local cross-repository check against the actual Techsafe contract.
if(process.argv[2]){
 const {selectEquipment,validateSnapshot,decideImport}=await import(pathToFileURL(process.argv[2]).href);
 const snapshot={schemaVersion:2,environment:'sandbox',connectionId:'connection-1',sourceInstanceId:'mjv',organizationId:'org-1',orderId:'order-1',eventId:'event-1',generation:1,revision:1,complete:true,scopeState:'committed',orderStatus:'open',currency:'USD',minimumUnitValueCents:50000,customerRef:'customer-1',customerName:'Synthetic Customer',siteRef:'site-1',lines:output.equipment};
 validateSnapshot(snapshot);assert.deepEqual(selectEquipment(snapshot).equipment,output.equipment);
 const binding={connectionId:'connection-1',sourceInstanceId:'mjv',organizationId:'org-1',environment:'sandbox',generation:1,dealerId:'dealer-1',status:'active',reconciliationRequired:false};
 let current=null,lastEquipment=[];
 for(let revision=1;revision<=8;revision++){
  const r=row({unitSalePrice:revision===8?'825.00':'800.00'});r.line.quantity=revision===8?'2.00':String(revision);
  const extra=row({line:{...row().line,id:'removed-later'},unitSalePrice:'700.00'});
  extra.membership={verified:true,scope:revision===8?'removed':'included',orderId:'order-1',sourceLineId:'removed-later'};
  const prepared=prepareSalesEquipment(input([r,extra,namedMisc]));
  // Distinct source identities remain mandatory even for excluded rows.
  if(!prepared.valid)throw new Error('Unexpected incomplete synthetic revision');
  const hash=String(revision).repeat(64),payload={...snapshot,revision,lines:prepared.equipment};
  const decision=decideImport(payload,binding,current,hash);assert.equal(decision.action,'replace_draft');lastEquipment=decision.equipment;
  current={connectionId:binding.connectionId,dealerId:binding.dealerId,orderId:'order-1',revision,contentHash:hash,lifecycle:'draft'};
 }
 assert.equal(lastEquipment.length,1);assert.equal(lastEquipment[0].quantity,2);assert.equal(lastEquipment[0].unitEquipmentValueCents,82500);
 const hiddenFinal=prepareSalesEquipment(input([hidden]));assert.equal(hiddenFinal.equipment.length,1);
 assert.equal(decideImport({...snapshot,revision:9,lines:[]},binding,current,'9'.repeat(64)).action,'suppress_draft');
 console.log('Actual Techsafe receiver contract accepted the prepared sales-price-only lines. The test envelope is synthetic; no real source snapshot was certified.');
}
console.log('Sales equipment checks passed: sold-price-only values, cost/list-price independence, exact cents, inclusive per-unit minimum, existing material/labor classes, miscellaneous/opt-out/removal/supplied exclusions, distinct identities, tenant binding and blocked partial/unresolved candidates. No source read/write, transport or quote authorization exists.');

