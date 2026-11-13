// Every sold equipment line must reference a catalog product, including Misc.
// Misc's description and price are overridden per sale, never saved as new products.
const money = value => {
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round((n+Number.EPSILON)*100):null;
};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
export function normalizeSoldEquipmentItem(item){
 if(!item||typeof item!=='object')throw Error('sold_item_required');
 if(!uuid(item.lineId))throw Error('stable_sold_line_id_required');
 if(item.removed===true||item.sold===false)return null;
 if(!uuid(item.productId))throw Error('catalog_product_id_required');
 if(!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<=0||Number(item.quantity)>10000)throw Error('invalid_sold_quantity');
 if(typeof item.description!=='string'||!item.description.trim())throw Error('sold_description_required');
 const unitCents=money(item.unitPrice),laborCents=money(item.soldLabor),minimumCents=money(item.minimumEligibleUnitPrice??0);
 if(unitCents===null||laborCents===null||minimumCents===null)throw Error('invalid_sold_amount');
 const quantity=Number(item.quantity);
 return Object.freeze({sourceLineId:item.lineId,catalogProductId:item.productId,
  itemKind:item.isMisc===true?'misc':'catalog',description:item.description.trim(),quantity,
  equipmentUnitCents:unitCents,equipmentTotalCents:unitCents*quantity,
  soldLaborCents:laborCents,eligibleByUnitMinimum:unitCents>=minimumCents});
}
export function normalizeSoldEquipmentItems(items){
 if(!Array.isArray(items))throw Error('sold_items_array_required');
 const seen=new Set();return items.map(normalizeSoldEquipmentItem).filter(item=>{
  if(item===null)return false;
  if(seen.has(item.sourceLineId))throw Error('duplicate_sold_line_id');
  seen.add(item.sourceLineId);return true;
 });
}
