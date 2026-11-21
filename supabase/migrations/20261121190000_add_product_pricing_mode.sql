-- Persist dealer-selected selling-price behavior independently of vendor cost.
-- Existing products are fixed to preserve every established selling price.
-- New non-API products remain fixed until a dealer explicitly changes the mode.
-- A future verified vendor import may explicitly set retail for newly imported products.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_retail_price numeric;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_retail_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_pricing_mode_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_pricing_mode_check
      CHECK (pricing_mode IN ('retail', 'fixed', 'margin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_vendor_retail_price_nonnegative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_vendor_retail_price_nonnegative
      CHECK (vendor_retail_price IS NULL OR vendor_retail_price >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.products.pricing_mode IS
  'Dealer-selected selling-price rule: fixed protects our_price; retail uses verified vendor MSRP; margin derives from cost. No automatic repricing is performed by this migration.';
COMMENT ON COLUMN public.products.vendor_retail_price IS
  'Vendor-published MSRP separate from dealer cost and manually set our_price. Only populate from verified authorized vendor feeds.';
