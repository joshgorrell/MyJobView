import { resolveVendorSellingPrice, type VendorPricingMode } from './vendorPricing';

/** A vendor quote is usable only when authenticated for the same tenant and product. */
export interface VendorQuote {
  organizationId: string;
  productId: string;
  vendorId: string;
  authorized: boolean;
  dealerCost?: number | null;
  retailPrice?: number | null;
  costVerifiedAt?: string | null;
  retailVerifiedAt?: string | null;
}

export interface CatalogPricingSnapshot {
  organizationId: string;
  productId: string;
  vendorId: string;
  pricingMode: VendorPricingMode;
  dealerCost: number;
  sellingPrice: number;
  retailPrice: number | null;
  targetMarginPercent: number | null;
}

export interface VendorPriceUpdate {
  cost: number;
  our_price: number;
  vendor_retail_price: number | null;
  vendor_retail_verified_at?: string;
}

const validMoney = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;
const verifiedDate = (s: string | null | undefined, now: Date, maxAgeMs: number): boolean => {
  if (!s || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && t <= now.getTime() && now.getTime() - t <= maxAgeMs;
};

/**
 * Pure preflight. Caller MUST enforce tenant-scoped DB authorization, trusted
 * vendor identity and a transactional update before persisting this patch.
 * Never run on proposal/invoice line snapshots.
 */
export function planAuthorizedVendorPriceUpdate(
  product: CatalogPricingSnapshot,
  quote: VendorQuote,
  now: Date,
  maxAgeMs: number
): { patch: VendorPriceUpdate; costFresh: boolean; retailFresh: boolean } {
  if (!quote.authorized || quote.organizationId !== product.organizationId ||
      quote.productId !== product.productId || quote.vendorId !== product.vendorId) {
    throw new Error('Vendor quote is not authorized for this tenant and product');
  }
  if (!validMoney(product.dealerCost) || !validMoney(product.sellingPrice)) {
    throw new Error('Invalid existing catalog price');
  }

  const costFresh = validMoney(quote.dealerCost) &&
    verifiedDate(quote.costVerifiedAt, now, maxAgeMs);
  const retailFresh = validMoney(quote.retailPrice) &&
    verifiedDate(quote.retailVerifiedAt, now, maxAgeMs);

  const cost = costFresh ? quote.dealerCost! : product.dealerCost;
  const retail = retailFresh ? quote.retailPrice! : product.retailPrice;
  // Stale retail must not trigger a repricing; retain the previous quote for display.
  const price = resolveVendorSellingPrice({
    mode: product.pricingMode,
    currentSellingPrice: product.sellingPrice,
    dealerCost: product.pricingMode === 'margin' && costFresh ? cost : null,
    retailPrice: product.pricingMode === 'retail' && retailFresh ? retail : null,
    targetMarginPercent: product.targetMarginPercent
  }).sellingPrice;

  return {
    costFresh, retailFresh,
    patch: {
      cost, our_price: price, vendor_retail_price: retail,
      ...(retailFresh ? { vendor_retail_verified_at: quote.retailVerifiedAt! } : {})
    }
  };
}
