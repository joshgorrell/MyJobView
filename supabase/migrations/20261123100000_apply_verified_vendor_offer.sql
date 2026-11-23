-- Apply a single staged vendor offer to the canonical product only.
-- No customer-document, job, or purchase-order table is updated.
ALTER TABLE public.products
 ADD COLUMN IF NOT EXISTS vendor_cost_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.apply_verified_vendor_offer(p_offer_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE offer public.vendor_supplier_offers;
DECLARE connection public.tenant_vendor_connections;
DECLARE current_product public.products;
DECLARE cost_is_fresh boolean;
DECLARE retail_is_fresh boolean;
BEGIN
  SELECT * INTO offer FROM public.vendor_supplier_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor offer not found'; END IF;
  SELECT * INTO connection FROM public.tenant_vendor_connections
    WHERE id = offer.connection_id FOR UPDATE;
  IF NOT FOUND OR connection.organization_id <> offer.organization_id
    OR connection.status <> 'authorized'
    OR connection.verified_at IS NULL
    OR (connection.expires_at IS NOT NULL AND connection.expires_at <= now()) THEN
    RAISE EXCEPTION 'Active verified vendor connection required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = connection.vendor_id AND v.organization_id = offer.organization_id
  ) THEN RAISE EXCEPTION 'Vendor tenant mismatch'; END IF;
  SELECT * INTO current_product FROM public.products
    WHERE id = offer.product_id AND organization_id = offer.organization_id
      AND default_vendor_id = connection.vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product vendor mapping changed'; END IF;

  cost_is_fresh := offer.dealer_cost IS NOT NULL
    AND offer.dealer_cost >= 0
    AND offer.cost_verified_at IS NOT NULL
    AND offer.cost_verified_at <= now()
    AND offer.cost_verified_at >= now() - interval '24 hours'
    AND (current_product.vendor_cost_verified_at IS NULL
      OR offer.cost_verified_at > current_product.vendor_cost_verified_at);

  retail_is_fresh := offer.retail_price IS NOT NULL
    AND offer.retail_price >= 0
    AND offer.retail_verified_at IS NOT NULL
    AND offer.retail_verified_at <= now()
    AND offer.retail_verified_at >= now() - interval '24 hours'
    AND (current_product.vendor_retail_verified_at IS NULL
      OR offer.retail_verified_at > current_product.vendor_retail_verified_at);

  IF NOT cost_is_fresh AND NOT retail_is_fresh THEN RETURN false; END IF;

  UPDATE public.products SET
    cost = CASE WHEN cost_is_fresh THEN offer.dealer_cost ELSE cost END,
    vendor_cost_verified_at = CASE WHEN cost_is_fresh
      THEN offer.cost_verified_at ELSE vendor_cost_verified_at END,
    vendor_retail_price = CASE WHEN retail_is_fresh
      THEN offer.retail_price ELSE vendor_retail_price END,
    vendor_retail_verified_at = CASE WHEN retail_is_fresh
      THEN offer.retail_verified_at ELSE vendor_retail_verified_at END
  WHERE id = current_product.id AND organization_id = offer.organization_id;

  -- Selling price is intentionally not changed, regardless of pricing_mode.
  -- A separate authorized catalog-pricing workflow may use vendor MSRP,
  -- but must never rewrite prices in existing customer documents.
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_verified_vendor_offer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_vendor_offer(uuid) TO service_role;
