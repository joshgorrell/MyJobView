// Canonical equipment normalization for Techsafe: sold scope, not catalog membership.
// Never silently discard a legitimate sold custom item because product_id is null.
const money = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round((n + Number.EPSILON) * 100) : null;
};
const positiveUnits = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 10000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export function normalizeSoldEquipmentItem(item) {
  if (!item || typeof item !== 'object') throw Error('sold_item_required');
  if (!uuid(item.lineId)) throw Error('stable_sold_line_id_required');
  if (item.removed === true || item.sold === false) return null;
  if (!positiveUnits(item.quantity)) throw Error('invalid_sold_quantity');
  if (typeof item.description !== 'string' || !item.description.trim()) throw Error('sold_description_required');
  const unitCents = money(item.unitPrice);
  const laborCents = money(item.soldLabor);
  if (unitCents === null || laborCents === null) throw Error('invalid_sold_amount');
  const quantity = Number(item.quantity);
  if (item.productId != null && !uuid(item.productId)) throw Error('invalid_catalog_product_id');
  return Object.freeze({
    sourceLineId:item.lineId,
    catalogProductId:item.productId ?? null,
    itemKind:item.productId == null ? 'custom' : 'catalog',
    description:item.description.trim(),
    quantity,
    equipmentUnitCents:unitCents,
    equipmentTotalCents:unitCents * quantity,
    soldLaborCents:laborCents,
    // Eligibility is based on equipment unit price, not labor or extended total.
    eligibleByUnitMinimum:unitCents >= money(item.minimumEligibleUnitPrice ?? 0),
  });
}
export function normalizeSoldEquipmentItems(items) {
  if (!Array.isArray(items)) throw Error('sold_items_array_required');
  const seen = new Set();
  return items.map(normalizeSoldEquipmentItem).filter(item => {
    if (item === null) return false;
    if (seen.has(item.sourceLineId)) throw Error('duplicate_sold_line_id');
    seen.add(item.sourceLineId);
    return true;
  });
}
