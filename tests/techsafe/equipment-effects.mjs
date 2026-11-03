import assert from 'node:assert/strict';
import {assessEquipmentEffects as assess} from '../../supabase/functions/_shared/techsafe-equipment-effects.mjs';
const binding={organizationId:'org',orderId:'order',proposalId:'proposal',changeOrderId:'co'};
const row=(identity='line',extra={})=>({line:{id:identity,organization_id:'org',proposal_id:'proposal',product_id:'product',item_type:'material',
 description:'Equipment',quantity:'1.00',is_customer_supplied:false,is_hidden:false,...extra},unitSalePrice:'500.00'});
const action=(type,extra={})=>({id:'action',organization_id:'org',change_order_id:'co',action_type:type,proposal_line_item_id:'line',
 sort_order:0,created_at:'1793460000.000001',remove_scope:null,...extra});
const input=(type,extra={})=>({binding,changeOrder:{id:'co',organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'approved'},
 beforeLines:[row()],afterLines:[row()],changeLines:[action(type)],...extra});
const pass=v=>{const r=assess(v);assert.equal(r.equipmentEffectsMatch,true,JSON.stringify(r));assert.equal(r.scopeVerified,false);assert.equal(r.snapshotReady,false);assert.equal(r.quoteReady,false);return r;};
const blocked=(v,code)=>{const r=assess(v);assert.equal(r.equipmentEffectsMatch,false);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));assert.deepEqual(r.addedLineBindings,[]);assert.deepEqual(r.removedLineIds,[]);return r;};
pass(input('modify_quantity',{changeLines:[action('modify_quantity',{new_quantity:'3.00'})],afterLines:[row('line',{quantity:3})]}));
const price=input('modify_price',{changeLines:[action('modify_price',{new_unit_price:'699.99'})],afterLines:[{...row(),unitSalePrice:'699.99'}]});pass(price);
blocked({...price,afterLines:[row()]},'equipment_effect_mismatch');
for(const remove_scope of [null,'parts_only','parts_and_labor']){
 const remove=input('remove',{changeLines:[action('remove',{remove_scope})],afterLines:[row('line',{is_hidden:true})]});
 assert.deepEqual(pass(remove).removedLineIds,['line']);blocked({...remove,afterLines:[row()]},'equipment_effect_mismatch');
}
pass(input('modify_labor'));pass(input('modify_modifiers'));
pass(input('modify_labor',{beforeLines:[row('line',{is_hidden:true})],afterLines:[row('line',{is_hidden:true})]}));
// An unrelated hidden row is not declared removed by this assessment.
assert.deepEqual(pass(input('modify_labor',{beforeLines:[row('line',{is_hidden:true})],afterLines:[row('line',{is_hidden:true})]})).removedLineIds,[]);
const add=action('add',{proposal_line_item_id:null,product_id:'new-product',product_name:'New Equipment',product_description:null,
 item_type:'material',new_quantity:'2',new_unit_price:'800'});
const newRow=row('new-line',{product_id:'new-product',description:'New Equipment',quantity:2});newRow.unitSalePrice='800.00';
const added=input('add',{changeLines:[add],afterLines:[row(),newRow]});
assert.deepEqual(pass(added).addedLineBindings,[{changeLineId:'action',sourceLineId:'new-line'}]);
blocked({...added,afterLines:[row()]},'addition_effect_missing');
blocked({...added,beforeLines:[row(),newRow]},'ambiguous_addition_identity');
blocked({...added,afterLines:[row(),newRow,{...newRow,line:{...newRow.line,id:'duplicate'}}]},'ambiguous_addition_identity');
blocked({...added,changeLines:[add,{...add,id:'second',sort_order:1}]},'ambiguous_addition_identity');
blocked({...added,afterLines:[row(),{...newRow,line:{...newRow.line,is_customer_supplied:true}}]},'addition_effect_missing');
blocked(input('modify_labor',{afterLines:[]}), 'unexpected_scope_size');
blocked(input('modify_labor',{afterLines:[row(),row('extra')]}),'unexpected_scope_size');
for(const change of [{product_id:'other'}, {description:'Changed'}, {is_customer_supplied:true}, {is_hidden:true}, {item_type:'both'}])
 blocked(input('modify_labor',{afterLines:[row('line',change)]}),'equipment_effect_mismatch');
blocked(input('modify_quantity',{changeLines:[action('modify_quantity',{proposal_line_item_id:'absent',new_quantity:2})]}),'action_target_missing');
blocked(input('modify_labor',{changeLines:[action('modify_labor',{organization_id:'other'})]}),'action_binding_mismatch');
blocked(input('modify_labor',{beforeLines:[row('line',{organization_id:'other'})]}),'effect_line_binding_mismatch');
blocked(input('modify_labor',{beforeLines:[row(),row()]}),'invalid_effect_line_identity');
blocked(input('modify_labor',{changeLines:[action('modify_labor'),action('modify_labor')]}),'invalid_action_identity');
blocked(input('modify_labor',{changeOrder:{...input('modify_labor').changeOrder,status:'draft'}}),'application_not_approved');
blocked(input('unsupported'),'unsupported_equipment_action');
blocked(input('remove',{changeLines:[action('remove',{remove_scope:'unknown'})]}),'invalid_removal_scope');
// Source order is sort_order NULLS LAST, created_at NULLS LAST; no ID tie-breaker.
const first=action('modify_quantity',{id:'first',sort_order:0,new_quantity:2});
const second=action('modify_quantity',{id:'second',sort_order:0,created_at:'1793460000.000002',new_quantity:3});
pass(input('modify_quantity',{changeLines:[second,first],afterLines:[row('line',{quantity:3})]}));
blocked(input('modify_quantity',{changeLines:[first,{...second,created_at:first.created_at}]}),'ambiguous_action_order');
pass(input('modify_quantity',{changeLines:[{...first,sort_order:null},{...second,sort_order:1}],afterLines:[row('line',{quantity:2})]}));
pass(input('modify_quantity',{changeLines:[{...first,created_at:null},second],afterLines:[row('line',{quantity:2})]}));
blocked(input('modify_labor',{changeLines:[action('modify_labor',{created_at:'2026-10-31'})]}),'invalid_action_order');
blocked(input('modify_quantity',{changeLines:[action('modify_quantity',{new_quantity:'1.5'})]}),'invalid_quantity');
blocked(input('modify_price',{changeLines:[action('modify_price',{new_unit_price:'1.001'})]}),'invalid_sales_price');
// Arbitrary cost/retail/labor fields cannot change the explicit projection.
pass(input('modify_labor',{beforeLines:[{...row(),cost:'999',retail_price:'700',line:{...row().line,cost:'99',labor_total:'10'}}],
 afterLines:[{...row(),cost:'1',retail_price:'1',line:{...row().line,cost:'1',labor_total:'900'}}]}));
assert.equal(assess(null).equipmentEffectsMatch,false);
console.log('Equipment effects passed: exact quantity/selling-price changes, approved removal effects, unique addition identities, dedup/missing/collateral failures, source ordering and tenant bindings. Scope and quote authorization remain false.');
