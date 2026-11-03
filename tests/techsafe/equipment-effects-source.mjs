// Actual repository applier in disposable PostgreSQL; no Supabase connection.
import assert from 'node:assert/strict';
import {applicationObservationDb} from './fixtures/application-observation-db.mjs';
import {assessEquipmentEffects} from '../../supabase/functions/_shared/techsafe-equipment-effects.mjs';
const f=await applicationObservationDb(),{db,id,org,order,proposal}=f;
try{
 await db.exec('ALTER TABLE proposal_line_items ADD COLUMN is_customer_supplied boolean DEFAULT false;');
 await db.query("INSERT INTO proposal_line_items(id,organization_id,proposal_id,product_id,description,item_type,quantity,unit_price) VALUES($1,$2,$3,$4,'Original equipment','material',1,500)",[id(60),org,proposal,id(50)]);
 const snapshots=async()=>(await db.query(`SELECT jsonb_build_object('line',jsonb_build_object('id',id,'organization_id',organization_id,'proposal_id',proposal_id,
  'product_id',product_id,'description',description,'item_type',item_type,'quantity',quantity::text,'is_customer_supplied',is_customer_supplied,'is_hidden',is_hidden),
  'unitSalePrice',unit_price::text) AS row FROM proposal_line_items WHERE proposal_id=$1 ORDER BY id`,[proposal])).rows.map(x=>x.row);
 let counter=100;const results=[];
 async function execute(label,actions,expected,code,afterApply){
  const co=id(counter++);
  await db.query("INSERT INTO change_orders(id,organization_id,sales_order_id,status) VALUES($1,$2,$3,'approved')",[co,org,order]);
  for(let n=0;n<actions.length;n++){
   const a=actions[n];
   await db.query(`INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,proposal_line_item_id,product_id,product_name,
    new_quantity,new_unit_price,item_type,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'material',$10)`,
   [id(counter++ +1000),co,org,a.type,a.target===undefined?id(60):a.target,a.product??id(50),a.name??'Added equipment',a.quantity??1,a.price??500,n]);
  }
  await db.exec('BEGIN');
  const beforeLines=await snapshots();
  const changeOrder=(await db.query('SELECT co.*,so.proposal_id FROM change_orders co JOIN sales_orders so ON so.id=co.sales_order_id WHERE co.id=$1',[co])).rows[0];
  const changeLines=(await db.query("SELECT *,NULL::text AS remove_scope,extract(epoch FROM created_at)::text AS created_at FROM change_order_line_items WHERE change_order_id=$1",[co])).rows;
  await db.query('SELECT public.apply_change_order($1)',[co]);
  if(afterApply)await afterApply(co);
  const assessment=assessEquipmentEffects({binding:{organizationId:org,orderId:order,proposalId:proposal,changeOrderId:co},changeOrder,changeLines,beforeLines,afterLines:await snapshots()});
  await db.exec('COMMIT');
  assert.equal(assessment.equipmentEffectsMatch,expected,label+': '+JSON.stringify(assessment));
  if(code)assert.ok(assessment.issues.some(x=>x.code===code),JSON.stringify(assessment));
  assert.equal(assessment.scopeVerified,false);assert.equal(assessment.quoteReady,false);
  results.push({label,effectsMatch:assessment.equipmentEffectsMatch,issues:assessment.issues.map(x=>x.code)});
 }
 await execute('quantity',[{type:'modify_quantity',quantity:3}],true);
 await execute('selling_price',[{type:'modify_price',price:625.25}],true);
 await execute('remove',[{type:'remove'}],true);
 await execute('labor_keeps_equipment',[{type:'modify_labor'}],true);
 await execute('modifiers_keep_equipment',[{type:'modify_modifiers',target:null}],true);
 await execute('unique_addition',[{type:'add',target:null,product:id(51),name:'Unique addition',quantity:2,price:800}],true);
 await execute('deduplicated_add_retry',[{type:'add',target:null,product:id(51),name:'Unique addition',quantity:2,price:800}],false,'ambiguous_addition_identity');
 await execute('two_identical_additions',[{type:'add',target:null,product:id(52),name:'Duplicate request',price:900},
  {type:'add',target:null,product:id(52),name:'Duplicate request',price:900}],false,'ambiguous_addition_identity');
 await execute('missing_quantity_target',[{type:'modify_quantity',target:id(999),quantity:4}],false,'action_target_missing');
 await execute('removal_restored_before_read',[{type:'remove'}],false,'equipment_effect_mismatch',co=>db.query('SELECT public.reject_change_order($1,NULL)',[co]));
 assert.deepEqual((await f.definitions()).map(x=>f.normalize(x.definition)),f.originalDefinitions.map(x=>f.normalize(x.definition)),'Source applier and rejector must remain unchanged');
 console.log(JSON.stringify({scenarios:results,sourceBodiesUnchanged:true,nativeSupabase:false,scopeVerified:false,quoteReady:false}));
}finally{await db.close();}
