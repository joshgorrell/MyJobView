// Per-product unit price only, from trusted consistent private source facts.
// Project discounts, miscellaneous percentages and other aggregate adjustments
// neither change this price nor make it unresolved.
import {salesPriceToCents} from './techsafe-sales-equipment.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function resolveStandaloneSellingPrice(input,binding){
 const result={salesPriceResolved:false,unitSalePrice:null,unitEquipmentValueCents:null,issues:[],scopeVerified:false,snapshotReady:false,quoteReady:false};
 const stop=code=>{throw Error(code);};
 try{
  const row=input?.row,c=input?.context,b=c?.binding,l=row?.line;
  if(!object(binding)||![binding.connectionId,binding.organizationId,binding.orderId,binding.proposalId].every(id)
   ||!object(c)||c.version!==1||!object(b)||!['connectionId','organizationId','orderId','proposalId'].every(k=>b[k]===binding[k]))stop('selling_price_context_unbound');
  if(!object(row)||!object(l)||!id(l.id)||l.organization_id!==binding.organizationId||l.proposal_id!==binding.proposalId)stop('selling_price_line_unbound');
  const facts=row.salePriceFacts;
  if(!object(facts)||!Object.hasOwn(facts,'parentItemId')||typeof facts.hasChildren!=='boolean')stop('selling_price_facts_unavailable');
  if(facts.parentItemId!==null||facts.hasChildren||facts.displayMode!=='itemized')stop('bundle_price_allocation_unresolved');
  const cents=BigInt(salesPriceToCents(row.unitSalePrice));
  result.salesPriceResolved=true;result.unitSalePrice=String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');result.unitEquipmentValueCents=Number(cents);
 }catch(error){result.issues.push({code:error.message||'selling_price_unresolved'});}
 return result;
}

