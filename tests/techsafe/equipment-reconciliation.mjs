import assert from 'node:assert/strict';
import {reconcileApprovedSalesOrderEquipment as reconcile} from '../../src/lib/techsafe/equipmentReconciliation.mjs';
const order={id:'so-1',organizationId:'tenant-1',proposalId:'approved-source-1',approved:true,revision:7};
const base=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-source-1',productId:'tv',quantity:2}];
const change={id:'co-1',salesOrderId:'so-1',organizationId:'tenant-1',status:'approved',customerApproved:true,revision:6,
 lines:[{id:'line-1',changeOrderId:'co-1',organizationId:'tenant-1',actionType:'modify_quantity',proposalLineItemId:'base-1',productId:'tv',newQuantity:3},
 {id:'line-2',changeOrderId:'co-1',organizationId:'tenant-1',actionType:'add',productId:'speaker',newQuantity:2}]};
const run=(patch={})=>reconcile({salesOrder:order,baseLines:base,changeOrders:[change],expectedRevision:7,...patch});
assert.deepEqual(run().items.map(x=>[x.productId,x.quantity]),[['tv',3],['speaker',2]]);
assert.equal(run().reason,'reconciled_not_certified');
const denied=(patch,reason)=>assert.equal(run(patch).reason,reason);
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
console.log('Pure Sales Order equipment reconciliation contract: PASS');
