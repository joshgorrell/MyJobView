// Canonical snapshot of editable MJV change-order rows for eventual atomic commit.
// No DB writes, approval decisions or Techsafe export permissions are provided here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value,field,optional=false) {
  if (optional && (value===null || value===undefined)) return null;
  if (typeof value!=='string'||!UUID.test(value)) throw new Error(field+' requires UUID');
  return value.toLowerCase();
}
function cents(value,field,optional=false) {
  if (optional && (value===null||value===undefined)) return null;
  if ((typeof value!=='string'&&typeof value!=='number') || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value)))
    throw new Error(field+' requires exact currency with at most two decimal places');
  const s=String(value),neg=s.startsWith('-'),raw=neg?s.slice(1):s,[whole,fraction='']=raw.split('.');
  const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  return (neg?-n:n).toString();
}
function decimal(value,field,optional=false) {
  if (optional && (value===null||value===undefined)) return null;
  if ((typeof value!=='string'&&typeof value!=='number') || !/^-?\d+(?:\.\d+)?$/.test(String(value)))
    throw new Error(field+' must be a decimal');
  return String(value);
}
export function snapshotChangeOrderLines({changeOrderId,organizationId,rows}) {
  uuid(changeOrderId,'changeOrderId');uuid(organizationId,'organizationId');
  if(!Array.isArray(rows)) throw new Error('rows must be an array');
  const ids=new Set();
  const lines=rows.map(row=>{
    if(!row || typeof row!=='object' || Array.isArray(row)) throw new Error('Invalid change-order line');
    const lineId=uuid(row.id,'line id');
    if(ids.has(lineId)) throw new Error('Duplicate change-order line');
    ids.add(lineId);
    if(uuid(row.change_order_id,'line change order')!==changeOrderId.toLowerCase() ||
       uuid(row.organization_id,'line organization')!==organizationId.toLowerCase())
      throw new Error('Cross-order or cross-organization change-order line');
    if(!['add','remove','modify'].includes(row.action_type))
      throw new Error('Unsupported change-order action: '+row.action_type);
    const result={
      lineId,action:row.action_type,
      productId:uuid(row.product_id,'productId',true),
      proposalLineItemId:uuid(row.proposal_line_item_id,'proposalLineItemId',true),
      itemType:row.item_type??null,
      originalQuantity:decimal(row.original_quantity,'originalQuantity',true),
      newQuantity:decimal(row.new_quantity,'newQuantity',true),
      originalUnitPriceCents:cents(row.original_unit_price,'originalUnitPrice',true),
      newUnitPriceCents:cents(row.new_unit_price,'newUnitPrice',true),
      originalTotalCents:cents(row.original_total,'originalTotal',true),
      newTotalCents:cents(row.new_total,'newTotal',true),
      changeAmountCents:cents(row.change_amount,'changeAmount',true),
      originalLaborTotalCents:cents(row.original_labor_total,'originalLaborTotal',true),
      newLaborTotalCents:cents(row.new_labor_total,'newLaborTotal',true),
      laborHours:decimal(row.labor_hours,'laborHours',true),
      laborRateCents:cents(row.labor_rate,'laborRate',true),
      laborTotalCents:cents(row.labor_total,'laborTotal',true),
      roomName:row.room_name??null,installLocation:row.install_location??null,
      removeScope:row.remove_scope??null,
      modifierAdjustments:row.modifier_adjustments??null,
      taxClassificationId:uuid(row.tax_classification_id,'taxClassificationId',true)
    };
    if(result.action==='add'&&!result.productId && result.itemType!=='labor')
      throw new Error('Added non-labor line requires catalog product');
    if(result.action!=='add'&&!result.proposalLineItemId)
      throw new Error('Existing line mutation requires original proposal line identity');
    return result;
  });
  return lines.sort((a,b)=>a.lineId.localeCompare(b.lineId));
}
