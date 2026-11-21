/**
 * A document line's selling price is captured at insertion and is never
 * recomputed from catalog or vendor prices after that moment.
 */
export interface PricedDocumentLine {
  unit_price: number;
  quantity: number;
  amount: number;
  cost?: number | null;
}

const money = (value: number): boolean => Number.isFinite(value) && value >= 0;

export function snapshotDocumentLine<T extends PricedDocumentLine>(line: T): T {
  if (!money(line.unit_price) || !money(line.quantity)) throw new Error('Invalid document price or quantity');
  return { ...line, amount: Math.round((line.unit_price * line.quantity + Number.EPSILON) * 100) / 100 };
}

/** Only updates internal cost; customer-facing unit price and amount stay frozen. */
export function refreshDocumentLineCost<T extends PricedDocumentLine>(line: T, verifiedCost: number): T {
  if (!money(verifiedCost)) throw new Error('Invalid verified cost');
  return { ...line, cost: verifiedCost };
}

/** Document conversion must copy the source price, not the current catalog price. */
export function copyDocumentLineToNextStage<T extends PricedDocumentLine>(source: T): T {
  return snapshotDocumentLine(source);
}
