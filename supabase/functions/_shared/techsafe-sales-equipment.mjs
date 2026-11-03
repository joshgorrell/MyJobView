// Pure, inactive preparation only. Inputs must come from a trusted consistent
// source read model. This does not authenticate, verify freshness or send drafts.
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function salesPriceToCents(value){
 if(typeof value!=='string'&&typeof value!=='number')fail('invalid_sales_price');
 if(typeof value==='number'&&!Number.isFinite(value))fail('invalid_sales_price');
 const m=/^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(String(value));if(!m)fail('invalid_sales_price');
 const cents=BigInt(m[1])*100n+BigInt((m[2]??'').padEnd(2,'0'));
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))fail('sales_price_overflow');return Number(cents);
}
function quantity(value){
 if(typeof value!=='string'&&typeof value!=='number')fail('invalid_quantity');
 if(!/^\d{1,5}(?:\.0{1,2})?$/.test(String(value)))fail('invalid_quantity');
 const count=Number(value);if(!Number.isSafeInteger(count)||count>10000)fail('invalid_quantity');return count;
}
function miscellaneous(product){
 return typeof product.sku==='string'&&product.sku.trim().toUpperCase()==='MISC-ITEM'
  ||typeof product.name==='string'&&['miscellaneous item','misc item'].includes(product.name.trim().toLowerCase());
}
/**
 * unitSalePrice is the resolved actual per-unit equipment selling price in USD,
 * supplied separately from catalog data. Never fall back to cost/list/retail.
 * Reuse material/labor/both; no new source classification or source writes.
 */
export function prepareSalesEquipment(input){
 if(!object(input)||!id(input.organizationId)||!id(input.orderId)||!id(input.proposalId)||!Array.isArray(input.lines)||input.lines.length>10000)fail('invalid_source_input');
 if(!Number.isSafeInteger(input.minimumUnitValueCents)||input.minimumUnitValueCents<0)fail('invalid_minimum');
 const equipment=[],excluded=[],issues=[],seen=new Set(),productFacts=new Map();let total=0;
 for(const row of input.lines){
  if(!object(row)||!object(row.line)||!id(row.line.id)||seen.has(row.line.id))fail('invalid_line_identity');
  const {line,product,exclusion,membership}=row;seen.add(line.id);
  if(line.organization_id!==input.organizationId)fail('source_tenant_mismatch');
  if(line.proposal_id!==input.proposalId)fail('source_proposal_mismatch');
  if(line.product_id!==null&&!id(line.product_id))fail('invalid_product_identity');
  if(exclusion!==null&&(!object(exclusion)||exclusion.product_id!==line.product_id||exclusion.organization_id!==input.organizationId))fail('exclusion_binding_unverified');
  if(exclusion!==null&&(typeof exclusion.excluded!=='boolean'||typeof exclusion.miscellaneous_placeholder!=='boolean'))fail('invalid_exclusion');
  if(product!==null&&(!object(product)||product.id!==line.product_id||product.organization_id!==input.organizationId))fail('product_binding_mismatch');
  if(product!==null&&(typeof product.name!=='string'||product.sku!==null&&typeof product.sku!=='string'))fail('product_metadata_unverified');
  if(line.product_id!==null){
   const facts=JSON.stringify({product:product===null?null:{item_type:product.item_type,name:product.name,sku:product.sku},
    excluded:exclusion?.excluded??false,miscellaneous:exclusion?.miscellaneous_placeholder??false});
   if(productFacts.has(line.product_id)&&productFacts.get(line.product_id)!==facts)fail('inconsistent_product_facts');
   productFacts.set(line.product_id,facts);
  }
  let reason;
  if(exclusion?.miscellaneous_placeholder||product&&miscellaneous(product))reason='miscellaneous';
  else if(exclusion?.excluded)reason='product_opt_out';
  else if(line.product_id===null)reason='non_product';
  else if(product===null){issues.push({sourceLineId:line.id,code:'product_unavailable'});continue;}
  else if(line.item_type==='labor'||product.item_type==='labor')reason='labor';
  else if(!['material','both'].includes(line.item_type)||product.item_type!=='material'){issues.push({sourceLineId:line.id,code:'classification_unverified'});continue;}
  if(reason){excluded.push({sourceLineId:line.id,reason});continue;}
  if(!object(membership)||membership.verified!==true||membership.orderId!==input.orderId||membership.sourceLineId!==line.id||!['included','removed'].includes(membership.scope)){
   issues.push({sourceLineId:line.id,code:'scope_unverified'});continue;
  }
  if(membership.scope==='removed'){excluded.push({sourceLineId:line.id,reason:'removed'});continue;}
  if(typeof line.is_customer_supplied!=='boolean')fail('invalid_customer_supplied');
  if(line.is_customer_supplied){excluded.push({sourceLineId:line.id,reason:'customer_supplied'});continue;}
  if(row.salesPriceResolved!==true){issues.push({sourceLineId:line.id,code:'sales_price_unresolved'});continue;}
  let cents,count;
  try{cents=salesPriceToCents(row.unitSalePrice);count=quantity(line.quantity);}
  catch(error){issues.push({sourceLineId:line.id,code:error.code});continue;}
  if(count===0||cents===0){excluded.push({sourceLineId:line.id,reason:'zero_value_or_quantity'});continue;}
  if(cents<input.minimumUnitValueCents){excluded.push({sourceLineId:line.id,reason:'below_minimum'});continue;}
  const extended=count*cents;total+=extended;
  if(!Number.isSafeInteger(extended)||!Number.isSafeInteger(total)){issues.push({sourceLineId:line.id,code:'value_overflow'});continue;}
  if(typeof line.description!=='string'||line.description.length>4000)fail('invalid_description');
  // Deliberate allowlist: no cost, margin, catalog price, labor, tax or source dump.
  equipment.push(Object.freeze({sourceLineId:line.id,productRef:line.product_id,productKind:'equipment',
   scope:'included',customerSupplied:false,techsafeExcluded:false,quantity:count,
   unitEquipmentValueCents:cents,description:line.description}));
 }
 // Never hand a partial candidate set to a future snapshot builder.
 return {equipment:issues.length?[]:equipment.sort((a,b)=>a.sourceLineId<b.sourceLineId?-1:a.sourceLineId>b.sourceLineId?1:0),
  excluded,issues,valid:issues.length===0,snapshotReady:false,quoteReady:false};
}
