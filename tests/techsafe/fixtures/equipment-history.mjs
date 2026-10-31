import {createHash} from 'node:crypto';
// Synthetic hashes test cross-checks; these are not PostgreSQL JSONB digests.
export const copy=v=>structuredClone(v),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
export const row=(id,product)=>({line:{id,organization_id:'org',proposal_id:'proposal',product_id:product,item_type:'material',description:product,
 quantity:'1.00',is_customer_supplied:false,is_hidden:false},unitSalePrice:'500.00'});
export function history(){
 const pairs=[],observations=[],changeOrders=[],inputs=[];let lines=[row('line','TV'),row('old-line','Speaker')];
 const actions=[['modify_quantity','2.00'],['modify_price','650.00'],['add',null],['remove',null],['modify_quantity','3.00'],['modify_price','700.00'],['modify_labor',null],['modify_modifiers',null]];
 for(let n=0;n<actions.length;n++){
  const [type,value]=actions[n],co={id:'co-'+n,organization_id:'org',sales_order_id:'order',proposal_id:'proposal',status:'approved'};
  const a={id:'action-'+n,organization_id:'org',change_order_id:co.id,action_type:type,proposal_line_item_id:type==='remove'?'old-line':'line',
   sort_order:0,created_at:'1793460000.'+String(n).padStart(6,'0'),remove_scope:null};
  const before=copy(lines);
  if(type==='modify_quantity'){a.new_quantity=value;lines[0].line.quantity=value;}
  if(type==='modify_price'){a.new_unit_price=value;lines[0].unitSalePrice=value;}
  if(type==='remove')lines[1].line.is_hidden=true;
  if(type==='add'){
   Object.assign(a,{proposal_line_item_id:null,product_id:'Projector',product_name:'Projector',product_description:null,item_type:'material',new_quantity:'1.00',new_unit_price:'900.00'});
   const added=row('new-line','Projector');added.unitSalePrice='900.00';lines.push(added);
  }
  const inputHash=digest([co,a]),afterHash=digest(lines),observationId='receipt-'+n;
  const pair={pairVersion:1,observationId,binding:{...binding,changeOrderId:co.id},transactionId:String(100+n),startedOrder:String(n*10+1),completedOrder:String(n*10+4),
   equipmentInputHash:inputHash,beforeScopeHash:digest(before),afterScopeHash:afterHash,changeOrder:copy(co),changeLines:[a],beforeLines:before,afterLines:copy(lines)};
  pairs.push(pair);changeOrders.push(co);inputs.push({changeOrderId:co.id,inputHash});
  observations.push(receipt(pair));
 }
 return {pairs,currentModel:{readModelVersion:1,connectionId:binding.connectionId,organizationId:binding.organizationId,
  order:{id:binding.orderId,organization_id:binding.organizationId,proposal_id:binding.proposalId},lines:copy(lines),changeOrders,observations,
  equipmentEvidence:{version:2,scopeHash:digest(lines),inputs}}};
}
export function receipt(p){return {id:p.observationId,connectionId:binding.connectionId,changeOrderId:p.binding.changeOrderId,transactionId:p.transactionId,completed:true,
 equipmentStartedOrder:p.startedOrder,equipmentCompletedOrder:p.completedOrder,equipmentInputHash:p.equipmentInputHash,equipmentAfterScopeHash:p.afterScopeHash};}

