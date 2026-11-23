/**
 * Purchase order prices are transaction snapshots. Vendor feeds may refresh
 * catalog/estimated job costs, but must never mutate a previously created PO.
 */
export interface PurchaseOrderCostLine {
  quantity: number;
  unit_cost: number;
  extended_cost: number;
  actual_unit_cost?: number | null;
}

function valid(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function extended(unit: number, quantity: number): number {
  return Math.round((unit * quantity + Number.EPSILON) * 100) / 100;
}

/** Called only when a user intentionally adds a line to a new PO. */
export function snapshotPurchaseOrderLine<T extends PurchaseOrderCostLine>(line: T): T {
  if (!valid(line.unit_cost) || !valid(line.quantity)) throw new Error('Invalid PO cost or quantity');
  return { ...line, extended_cost: extended(line.unit_cost, line.quantity) };
}

/**
 * Vendor feeds must not change PO prices, even on older/open orders.
 * Return a copy so callers cannot accidentally mutate the original.
 */
export function preservePurchaseOrderOnVendorUpdate<T extends PurchaseOrderCostLine>(line: T): T {
  return { ...line };
}

/** Record an actual receipt/vendor-invoice cost separately from ordered cost. */
export function recordActualPurchaseCost<T extends PurchaseOrderCostLine>(line: T, actualUnitCost: number): T {
  if (!valid(actualUnitCost)) throw new Error('Invalid actual purchase cost');
  return { ...line, actual_unit_cost: actualUnitCost };
}

export function purchaseCostVariance(line: PurchaseOrderCostLine): number | null {
  if (line.actual_unit_cost == null) return null;
  return extended(line.actual_unit_cost - line.unit_cost, line.quantity);
}

/**
 * Adapter for the actual persisted purchasing schema (po_items), which uses
 * unit_price/total_price rather than the legacy helper's unit_cost/extended_cost.
 * This deliberately does not write to the database or refresh an existing PO.
 */
export interface PersistedPurchaseOrderLine {
  quantity: number;
  unit_price: number;
  total_price: number;
}

export function snapshotPersistedPurchaseOrderLine<T extends PersistedPurchaseOrderLine>(line: T): T {
  if (!valid(line.unit_price) || !valid(line.quantity) || !Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new Error('Invalid purchase order unit price or quantity');
  }
  return { ...line, total_price: extended(line.unit_price, line.quantity) };
}

export function preservePersistedPurchaseOrderOnVendorUpdate<T extends PersistedPurchaseOrderLine>(line: T): T {
  return { ...line };
}
