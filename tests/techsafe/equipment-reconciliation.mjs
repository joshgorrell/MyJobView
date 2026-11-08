import assert from 'node:assert/strict';
import {reconcileApprovedSalesOrderEquipment as reconcile} from '../../src/lib/techsafe/equipmentReconciliation.mjs';
const order={id:'so-1',organizationId:'tenant-1',proposalId:'approved-source-1',approved:true,revision:7};
const base=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-source-1',productId:'tv',quantity:2}];
const change={id:'co-1',salesOrderId:'so-1',organizationId:'tenant-1',status:'approved',customerApproved:true,revision:6,
 lines:[{id:'line-1',changeOrderId:'co-1',organizationId:'tenant-1',actionType:'modify_quantity',proposalLineItemId:'base-1',productId:'tv',newQuantity:3},
 {id:'line-2',changeOrderId:'co-1',organizationId:'tenant-1',actionType:'add',productId:'speaker',newQuantity:2}]};
const run=(patch={})=>{ const args={salesOrder:order,baseLines:base,changeOrders:[change],expectedRevision:7,...patch};
 const sourceManifest=patch.sourceManifest??{salesOrderId:order.id,organizationId:order.organizationId,proposalId:order.proposalId,revision:7,complete:true,approvalEvidenceVerified:true,baseLineCount:args.baseLines.length,changeOrderCount:args.changeOrders.length,changeLineCount:args.changeOrders.reduce((n,c)=>n+(c.lines?.length??0),0)};
 return reconcile({...args,sourceManifest}); };
assert.deepEqual(run().items.map(x=>[x.productId,x.quantity]),[['tv',3],['speaker',2]]);
assert.equal(run().reason,'reconciled_not_certified');
assert.equal(run().authorized,false);
assert.equal(run().snapshotReady,false);
const denied=(patch,reason)=>{ const result=run(patch); assert.equal(result.reason,reason); assert.equal(result.ok,false); assert.equal(result.authorized,false); assert.equal(result.snapshotReady,false); assert.deepEqual(result.items,[]); };
denied({salesOrder:{...order,approved:false}},'approved_sales_order_unverified');
denied({salesOrder:{...order,revision:8}},'stale_source_revision');
denied({baseLines:[{...base[0],organizationId:'tenant-2'}]},'source_scope_mismatch');
denied({baseLines:[{...base[0],quantity:10001}]},'invalid_quantity');
denied({baseLines:[base[0],base[0]]},'duplicate_base_line');
denied({changeOrders:[{...change,customerApproved:false}]},'change_order_not_customer_approved');
denied({changeOrders:[{...change,status:'pending'}]},'change_order_not_customer_approved');
denied({changeOrders:[{...change,salesOrderId:'so-2'}]},'change_order_scope_mismatch');
denied({changeOrders:[{...change,revision:8}]},'ambiguous_change_order_sequence');
denied({changeOrders:[change,change]},'duplicate_change_order');
denied({changeOrders:[{...change,lines:[{...change.lines[0],proposalLineItemId:'another-order'}]}]},'changed_item_not_in_sales_order');
denied({changeOrders:[{...change,lines:[{...change.lines[0],organizationId:'tenant-2'}]}]},'change_line_scope_mismatch');
denied({changeOrders:[{...change,lines:[{...change.lines[0],actionType:'modify_price',newQuantity:5}]}]},'price_change_cannot_change_quantity');
denied({changeOrders:[{...change,lines:[{...change.lines[0],actionType:'remove',newQuantity:2}]}]},'remove_must_zero_quantity');
denied({changeOrders:[{...change,lines:[{...change.lines[0],actionType:'replace'}]}]},'unsupported_change_action');
assert.deepEqual(run({changeOrders:[{...change,lines:[{...change.lines[0],actionType:'remove',newQuantity:0}]}]}).items,[]);
assert.deepEqual(run({changeOrders:[]}).items.map(x=>x.quantity),[2]);
const manifest={salesOrderId:order.id,organizationId:order.organizationId,proposalId:order.proposalId,revision:7,complete:true,approvalEvidenceVerified:true,baseLineCount:1,changeOrderCount:1,changeLineCount:2};
denied({sourceManifest:{...manifest,changeOrderCount:2}},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,changeLineCount:3}},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,revision:6}},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,organizationId:'other-tenant'}},'source_manifest_incomplete');
denied({sourceManifest:{}},'source_not_authoritatively_verified');
denied({sourceManifest:{...manifest,complete:false}},'source_not_authoritatively_verified');
denied({sourceManifest:{...manifest,approvalEvidenceVerified:false}},'source_not_authoritatively_verified');
denied({sourceManifest:{...manifest,changeLineCount:-1}},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,baseLineCount:-1}},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,changeOrderCount:-1}},'source_manifest_incomplete');
denied({baseLines:Array.from({length:10001},()=>base[0])},'source_too_large');
denied({changeOrders:Array.from({length:10001},()=>change)},'source_too_large');
denied({baseLines:[{...base[0],quantity:10000}],changeOrders:[{...change,lines:[{...change.lines[1],newQuantity:1}]}]},'equipment_quantity_limit_exceeded');
const manyLines=Array.from({length:10001},(_,i)=>({...change.lines[1],id:'added-'+i,newQuantity:1}));
denied({changeOrders:[{...change,lines:manyLines}]},'source_too_large');

// An independently obtained manifest must not silently adapt to caller-filtered arrays.
// Dropping a base item or approved change order is an incomplete source read.
denied({baseLines:[],sourceManifest:manifest},'source_manifest_incomplete');
denied({changeOrders:[],sourceManifest:manifest},'source_manifest_incomplete');
denied({changeOrders:[{...change,lines:[change.lines[0]]}],sourceManifest:manifest},'source_manifest_incomplete');
denied({sourceManifest:{...manifest,proposalId:'unapproved-proposal'}},'source_manifest_incomplete');
denied({salesOrder:{...order,proposalId:'other-proposal'},sourceManifest:manifest},'source_manifest_incomplete');

// Two edits to one base line inside the same approved change order are
// ambiguous without a source-defined intra-order sequence; reject rather
// than guessing whether a price or quantity change should win.
denied({changeOrders:[{...change,lines:[change.lines[0],{...change.lines[0],id:'duplicate-target',newQuantity:4}]}]},'ambiguous_change_order_line_actions');
denied({changeOrders:[{...change,lines:[change.lines[0],{...change.lines[0],id:'duplicate-target-price',actionType:'modify_price'}]}]},'ambiguous_change_order_line_actions');
// A later approved change order may legitimately update that same base line.
// A price-only customer-approved change must not alter the covered quantity.
const priceOnly={...change,id:'co-price',revision:6,lines:[{...change.lines[0],id:'price-line',changeOrderId:'co-price',actionType:'modify_price',newQuantity:2}]};
assert.deepEqual(run({changeOrders:[priceOnly]}).items.map(x=>x.quantity),[2]);
// Multiple approved changes must apply in ascending source revision order.
const first={...change,id:'co-first',revision:5,lines:[{...change.lines[0],id:'first-line',changeOrderId:'co-first',newQuantity:4}]};
const second={...change,id:'co-second',revision:6,lines:[{...change.lines[0],id:'second-line',changeOrderId:'co-second',newQuantity:5}]};
assert.deepEqual(run({changeOrders:[first,second]}).items.map(x=>x.quantity),[5]);
denied({changeOrders:[second,first]},'ambiguous_change_order_sequence');
// Repeated invocation must be deterministic and must not mutate source data.
const originalBase=structuredClone(base), originalChange=structuredClone(change);
assert.deepEqual(run(),run());
assert.deepEqual(base,originalBase);
assert.deepEqual(change,originalChange);
console.log('Pure Sales Order equipment reconciliation contract: PASS');
