// Pure diagnostic for trusted, transaction-bound before/after source reads.
// It neither establishes that provenance nor authorizes membership or a quote.
import {salesPriceToCents} from './techsafe-sales-equipment.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const text=v=>typeof v==='string'&&v.length<=4000;
const classes=['material','labor','both'];
function count(v){
 if(!['string','number'].includes(typeof v)||!/^\d{1,5}(?:\.0{1,2})?$/.test(String(v)))throw Error('invalid_quantity');
 const n=Number(v);if(!Number.isSafeInteger(n)||n>10000)throw Error('invalid_quantity');return n;
}
function time(v){
 // Canonical epoch text from the private reader; preserve microseconds exactly.
 if(typeof v!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/.test(v))throw Error('invalid_action_order');
 const [whole,fraction='']=v.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function assessEquipmentEffects(input){
 const result={equipmentEffectsMatch:false,issues:[],addedLineBindings:[],removedLineIds:[],scopeVerified:false,snapshotReady:false,quoteReady:false};
 const issue=(code,actionId)=>{result.issues.push(actionId?{code,actionId}:{code});};
 const stop=code=>{throw Error(code);};
 try{
  if(!object(input)||!object(input.binding)||!object(input.changeOrder))stop('invalid_effect_input');
  const {binding:b,changeOrder:co}=input;
  if(![b.organizationId,b.orderId,b.proposalId,b.changeOrderId].every(id)||co.id!==b.changeOrderId
   ||co.organization_id!==b.organizationId||co.sales_order_id!==b.orderId||co.proposal_id!==b.proposalId)stop('effect_binding_mismatch');
  if(co.status!=='approved')stop('application_not_approved');
  for(const key of ['beforeLines','afterLines','changeLines'])if(!Array.isArray(input[key])||input[key].length>10000)stop('invalid_effect_rows');
  function rows(source){
   const map=new Map();
   for(const row of source){
    const l=row?.line;
    if(!object(l)||!id(l.id)||map.has(l.id))stop('invalid_effect_line_identity');
    if(l.organization_id!==b.organizationId||l.proposal_id!==b.proposalId)stop('effect_line_binding_mismatch');
    if(l.product_id!==null&&!id(l.product_id)||!classes.includes(l.item_type)||!text(l.description)
     ||typeof l.is_customer_supplied!=='boolean'||typeof l.is_hidden!=='boolean')stop('invalid_effect_line');
    // Explicit equipment projection. Catalog, cost, retail and labor prices absent.
    map.set(l.id,{id:l.id,product:l.product_id,type:l.item_type,description:l.description,
     supplied:l.is_customer_supplied,hidden:l.is_hidden,quantity:count(l.quantity),price:salesPriceToCents(row.unitSalePrice)});
   }return map;
  }
  const expected=rows(input.beforeLines),after=rows(input.afterLines),beforeIds=new Set(expected.keys());
  const semantic=row=>JSON.stringify([row.product,row.description,row.quantity,row.price]);
  const semanticCounts=new Map(),newRows=new Map();
  const track=(row,delta)=>{const key=semantic(row);semanticCounts.set(key,(semanticCounts.get(key)??0)+delta);};
  for(const row of expected.values())track(row,1);
  for(const row of after.values())if(!beforeIds.has(row.id)&&!row.supplied&&!row.hidden){
   const key=semantic(row);if(!newRows.has(key))newRows.set(key,[]);newRows.get(key).push(row);
  }
  const actions=[],seen=new Set();
  for(const a of input.changeLines){
   if(!object(a)||!id(a.id)||seen.has(a.id))stop('invalid_action_identity');seen.add(a.id);
   if(a.organization_id!==b.organizationId||a.change_order_id!==co.id)stop('action_binding_mismatch');
   if(a.sort_order!==null&&(!Number.isInteger(a.sort_order)||a.sort_order< -2147483648||a.sort_order>2147483647))stop('invalid_action_order');
   actions.push({a,sort:a.sort_order,at:a.created_at===null?null:time(a.created_at)});
  }
  const nullable=(a,b)=>a===null?(b===null?0:1):b===null?-1:compare(a,b);
  actions.sort((a,b)=>nullable(a.sort,b.sort)||nullable(a.at,b.at));
  for(let n=1;n<actions.length;n++)if(nullable(actions[n-1].sort,actions[n].sort)===0&&nullable(actions[n-1].at,actions[n].at)===0)stop('ambiguous_action_order');
  const allocated=new Set(),added=[],removed=new Set();
  for(const {a} of actions){
   if(result.issues.length)break; // Fail closed without scanning more candidates.
   if(!['add','remove','modify_quantity','modify_price','modify_labor','modify_modifiers'].includes(a.action_type)){issue('unsupported_equipment_action',a.id);continue;}
   if(a.action_type==='modify_modifiers')continue; // Net sale-price resolution is separate.
   if(a.action_type==='add'){
    const description=a.product_description??a.product_name;
    if(a.product_id!==null&&!id(a.product_id)||!classes.includes(a.item_type)||!text(description))stop('invalid_addition');
    const wanted={product:a.product_id,type:a.item_type,description,supplied:false,hidden:false,quantity:count(a.new_quantity),price:salesPriceToCents(a.new_unit_price)};
    // The source deduplicates by values, without an addition identity receipt.
    if(semanticCounts.get(semantic(wanted))>0){issue('ambiguous_addition_identity',a.id);continue;}
    const candidates=(newRows.get(semantic(wanted))??[]).filter(row=>!allocated.has(row.id)&&row.type===wanted.type);
    if(candidates.length!==1){issue(candidates.length?'ambiguous_addition_identity':'addition_effect_missing',a.id);continue;}
    const line=candidates[0];expected.set(line.id,{id:line.id,...wanted});track(wanted,1);allocated.add(line.id);added.push({changeLineId:a.id,sourceLineId:line.id});
    continue;
   }
   if(!id(a.proposal_line_item_id)||!expected.has(a.proposal_line_item_id)){issue('action_target_missing',a.id);continue;}
   const line=expected.get(a.proposal_line_item_id);
   if(a.action_type==='remove'){
    if(![null,'parts_only','parts_and_labor'].includes(a.remove_scope))stop('invalid_removal_scope');
    line.hidden=true;removed.add(line.id);
   }else if(a.action_type==='modify_quantity'){track(line,-1);line.quantity=count(a.new_quantity);track(line,1);}
   else if(a.action_type==='modify_price'){track(line,-1);line.price=salesPriceToCents(a.new_unit_price);track(line,1);}
   // modify_labor has no equipment-projection effect; still bind its target.
  }
  if(expected.size!==after.size)issue('unexpected_scope_size');
  for(const [identity,line] of expected){
   const actual=after.get(identity);
   if(!actual||JSON.stringify(line)!==JSON.stringify(actual)){issue('equipment_effect_mismatch');break;}
  }
  result.equipmentEffectsMatch=result.issues.length===0;
  if(result.equipmentEffectsMatch){result.addedLineBindings=added;result.removedLineIds=[...removed].sort();}
 }catch(error){issue(error.message||'invalid_effect_input');}
 return result;
}
