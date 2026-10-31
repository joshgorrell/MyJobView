import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveStandaloneSellingPrice as resolve} from '../../supabase/functions/_shared/techsafe-unit-selling-price.mjs';
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
const fixture=()=>({context:{version:1,binding:{...binding}},row:{line:{id:'line',organization_id:'org',proposal_id:'proposal',quantity:'2.00'},
 unitSalePrice:'800.00',salePriceFacts:{parentItemId:null,displayMode:'itemized',hasChildren:false}}});
const pass=i=>{const r=resolve(i,binding);assert.equal(r.salesPriceResolved,true,JSON.stringify(r));assert.equal(r.unitSalePrice,'800.00');assert.equal(r.unitEquipmentValueCents,80000);
 for(const k of ['scopeVerified','snapshotReady','quoteReady'])assert.equal(r[k],false);return r;};
const block=(i,code)=>{const r=resolve(i,binding);assert.equal(r.salesPriceResolved,false);assert.equal(r.unitSalePrice,null);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));};
const unchanged=fixture(),before=JSON.stringify(unchanged);pass(unchanged);assert.equal(JSON.stringify(unchanged),before);
// These fields must not be read, allocated into unit values, or block pricing.
const irrelevant=fixture();
for(const target of [irrelevant.row,irrelevant.row.line,irrelevant.context])for(const key of ['cost','retail_price','discount_percent','misc_parts_percent','project_management_percent','is_billable','line_total'])
 Object.defineProperty(target,key,{get(){throw Error('Irrelevant field read: '+key);}});
pass(irrelevant);
const adjustments=fixture();adjustments.context.proposal={discount_percent:99,discount_amount:99999};adjustments.context.settings={misc_parts_percent:25,project_management_percent:10};
adjustments.context.changes=[{status:'approved',isBillable:false,discount_percent:99}];pass(adjustments);
const quantity=fixture();quantity.row.line.quantity='9999.00';quantity.row.line.line_total='1.00';pass(quantity);
const perUnit=fixture();perUnit.row.unitSalePrice='100.00';perUnit.row.line.quantity='10.00';assert.equal(resolve(perUnit,binding).unitEquipmentValueCents,10000);
for(const price of [null,undefined,'','-1.00','1.001','NaN','1e3']){const i=fixture();i.row.unitSalePrice=price;block(i,'invalid_sales_price');}
for(const change of [i=>{i.row.salePriceFacts.parentItemId='parent';},i=>{i.row.salePriceFacts.hasChildren=true;},i=>{i.row.salePriceFacts.displayMode='bundle';}]){const i=fixture();change(i);block(i,'bundle_price_allocation_unresolved');}
const absent=fixture();delete absent.row.salePriceFacts.parentItemId;block(absent,'selling_price_facts_unavailable');
const tenant=fixture();tenant.row.line.organization_id='other';block(tenant,'selling_price_line_unbound');
const context=fixture();context.context.binding.orderId='other';block(context,'selling_price_context_unbound');
assert.equal(resolve(null,binding).salesPriceResolved,false);
console.log('Unit selling prices passed: stored unit price only, project discounts/misc/fees/billing/extended totals ignored, no cost/retail reads, exact cents and bound standalone facts. No scope/quote authorization.');

export async function testUnitSellingPriceSource(f){
 const {db,id,org,actor,order,proposal,connection,line}=f;
 await db.exec("ALTER TABLE proposal_settings ADD COLUMN misc_parts_percent numeric DEFAULT 0;ALTER TABLE proposal_line_items ADD COLUMN parent_item_id uuid,ADD COLUMN display_mode text DEFAULT 'itemized';");
 await db.exec(fs.readFileSync('supabase/migrations/20261031203649_techsafe_standalone_selling_price_facts.sql','utf8'));
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 const read=async()=>(await db.query('SELECT techsafe_source.read_order_selling_price_facts($1,$2) AS model',[connection,order])).rows[0].model;
 const model=await read();assert.ok(model);assert.equal(JSON.stringify(model).includes('PRIVATE_'),false);assert.equal(JSON.stringify(model).includes('"cost"'),false);assert.equal(JSON.stringify(model).includes('retail_price'),false);
 assert.equal(Object.hasOwn(model,'pricingFacts'),false);assert.equal(Object.hasOwn(model.changeOrders[0],'discount_percent'),false);
 const b={connectionId:connection,organizationId:org,orderId:order,proposalId:proposal};
 const price=async()=>{const m=await read();return resolve({row:m.lines.find(x=>x.line.id===line),context:m.sellingPriceContext},b);};
 const proved=await price();assert.equal(proved.salesPriceResolved,true,JSON.stringify(proved));assert.equal(proved.unitEquipmentValueCents,80000);
 assert.equal(model.lines.find(x=>x.line.id===line).salesPriceResolved,false,'Detached evidence never mutates source readiness flags');
 for(const sql of ['UPDATE proposals SET discount_percent=99,discount_amount=99999','UPDATE proposal_settings SET discount_percent=25,misc_parts_percent=35',
  'UPDATE change_orders SET discount_percent=90,is_billable=false']){
  await db.exec('BEGIN');await db.exec(sql);assert.deepEqual(await read(),model,'Aggregate changes must not affect price-facts content');assert.equal((await price()).unitEquipmentValueCents,80000);await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET cost=999999 WHERE id=$1',[line]);assert.deepEqual(await read(),model);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET unit_price=900 WHERE id=$1',[line]);assert.equal((await price()).unitEquipmentValueCents,90000);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query("UPDATE proposal_line_items SET display_mode='bundle' WHERE id=$1",[line]);assert.equal((await price()).salesPriceResolved,false);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET parent_item_id=$1 WHERE id<>$1',[line]);assert.equal((await price()).salesPriceResolved,false);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.exec("UPDATE sales_orders SET status='active';UPDATE projects SET substantial_completion_date=NULL");assert.equal(await read(),null);await db.exec('ROLLBACK');
 for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN;SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK');}
 const a=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_order_selling_price_facts(uuid,uuid)'::regprocedure")).rows[0];
 assert.equal(a.prosecdef,false);assert.equal(a.provolatile,'s');assert.deepEqual(a.proconfig,['search_path=""']);
 assert.equal(model.quoteReady,false);
 console.log('Private unit price facts passed: ready-order bindings, product selling-price sensitivity, project-discount/misc/billing and cost independence, parent/child guards and denied API roles.');
}

