/**
 * Dealer selling-price rules for vendor-sourced catalog products.
 * Vendor cost is independent of selling price unless margin pricing is explicitly selected.
 * This module is pure: it does not update existing product records or proposals.
 */
export type VendorPricingMode = 'retail' | 'fixed' | 'margin';

export interface VendorPricingInput {
  mode: VendorPricingMode;
  currentSellingPrice: number;
  dealerCost?: number | null;
  retailPrice?: number | null;
  targetMarginPercent?: number | null;
}

export interface VendorPricingResult {
  sellingPrice: number;
  changed: boolean;
  reason: 'retail' | 'fixed' | 'margin' | 'missing_retail' | 'missing_cost' | 'invalid_margin';
}

function validAmount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function resolveVendorSellingPrice(input: VendorPricingInput): VendorPricingResult {
  const previous = input.currentSellingPrice;
  if (!validAmount(previous)) throw new Error('Invalid existing selling price');

  let next = previous;
  let reason: VendorPricingResult['reason'] = 'fixed';

  if (input.mode === 'retail') {
    if (validAmount(input.retailPrice)) {
      next = input.retailPrice;
      reason = 'retail';
    } else {
      reason = 'missing_retail';
    }
  } else if (input.mode === 'margin') {
    if (!validAmount(input.dealerCost)) {
      reason = 'missing_cost';
    } else if (
      typeof input.targetMarginPercent !== 'number' ||
      !Number.isFinite(input.targetMarginPercent) ||
      input.targetMarginPercent < 0 ||
      input.targetMarginPercent >= 100
    ) {
      reason = 'invalid_margin';
    } else {
      next = Math.round((input.dealerCost / (1 - input.targetMarginPercent / 100) + Number.EPSILON) * 100) / 100;
      reason = 'margin';
    }
  } else if (input.mode !== 'fixed') {
    throw new Error('Unknown vendor pricing mode');
  }

  return { sellingPrice: next, changed: next !== previous, reason };
}
