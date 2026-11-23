-- Vendor prices are staged, never applied directly to customer documents or POs.
-- No connector is activated by this migration.
CREATE TABLE IF NOT EXISTS public.tenant_vendor_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  connector_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  vendor_account_reference text,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_vendor_connection_status CHECK (status IN ('pending','authorized','suspended','expired','revoked')),
  CONSTRAINT tenant_vendor_connection_verified CHECK (status <> 'authorized' OR verified_at IS NOT NULL),
  UNIQUE (organization_id, vendor_id, connector_key)
);
CREATE TABLE IF NOT EXISTS public.vendor_supplier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.tenant_vendor_connections(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  supplier_sku text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  dealer_cost numeric,
  retail_price numeric,
  cost_verified_at timestamptz,
  retail_verified_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_offer_nonnegative CHECK (
    (dealer_cost IS NULL OR dealer_cost >= 0) AND
    (retail_price IS NULL OR retail_price >= 0)
  ),
  CONSTRAINT vendor_offer_currency CHECK (currency = 'USD'),
  CONSTRAINT vendor_offer_verified CHECK (
    (dealer_cost IS NULL OR cost_verified_at IS NOT NULL) AND
    (retail_price IS NULL OR retail_verified_at IS NOT NULL)
  ),
  UNIQUE (connection_id, product_id, supplier_sku)
);
CREATE INDEX IF NOT EXISTS vendor_supplier_offers_tenant_product_idx
 ON public.vendor_supplier_offers(organization_id, product_id);

ALTER TABLE public.tenant_vendor_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_supplier_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_vendor_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vendor_supplier_offers FROM PUBLIC, anon, authenticated;
-- Service-side ingestion only. Never expose account references or dealer costs to the browser.
GRANT SELECT, INSERT, UPDATE ON public.tenant_vendor_connections TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.vendor_supplier_offers TO service_role;

-- A verified connector may stage prices only for its own tenant's mapped products.
-- The calling backend must independently authenticate the vendor API response.
CREATE OR REPLACE FUNCTION public.stage_verified_vendor_offer(
  p_connection_id uuid,
  p_product_id uuid,
  p_supplier_sku text,
  p_dealer_cost numeric,
  p_retail_price numeric,
  p_cost_verified_at timestamptz,
  p_retail_verified_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE c public.tenant_vendor_connections;
DECLARE result_id uuid;
BEGIN
  SELECT * INTO c FROM public.tenant_vendor_connections
  WHERE id = p_connection_id AND status = 'authorized'
    AND verified_at IS NOT NULL AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified vendor connection required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendors v WHERE v.id = c.vendor_id
      AND v.organization_id = c.organization_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = p_product_id
      AND p.organization_id = c.organization_id
      AND p.default_vendor_id = c.vendor_id
  ) THEN RAISE EXCEPTION 'Vendor/product tenant or mapping mismatch'; END IF;
  IF nullif(btrim(p_supplier_sku),'') IS NULL OR
     (p_dealer_cost IS NULL AND p_retail_price IS NULL) OR
     (p_dealer_cost IS NOT NULL AND (p_dealer_cost < 0 OR p_cost_verified_at IS NULL)) OR
     (p_retail_price IS NOT NULL AND (p_retail_price < 0 OR p_retail_verified_at IS NULL)) OR
     (p_cost_verified_at IS NOT NULL AND p_cost_verified_at > now()) OR
     (p_retail_verified_at IS NOT NULL AND p_retail_verified_at > now()) THEN
    RAISE EXCEPTION 'Invalid verified vendor offer'; END IF;
  INSERT INTO public.vendor_supplier_offers (
    organization_id,connection_id,product_id,supplier_sku,dealer_cost,retail_price,
    cost_verified_at,retail_verified_at
  ) VALUES (
    c.organization_id,c.id,p_product_id,btrim(p_supplier_sku),p_dealer_cost,p_retail_price,
    p_cost_verified_at,p_retail_verified_at
  )
  ON CONFLICT (connection_id,product_id,supplier_sku) DO UPDATE SET
    dealer_cost = CASE WHEN EXCLUDED.cost_verified_at >= public.vendor_supplier_offers.cost_verified_at
      THEN EXCLUDED.dealer_cost ELSE public.vendor_supplier_offers.dealer_cost END,
    retail_price = CASE WHEN EXCLUDED.retail_verified_at >= public.vendor_supplier_offers.retail_verified_at
      THEN EXCLUDED.retail_price ELSE public.vendor_supplier_offers.retail_price END,
    cost_verified_at = greatest(public.vendor_supplier_offers.cost_verified_at,EXCLUDED.cost_verified_at),
    retail_verified_at = greatest(public.vendor_supplier_offers.retail_verified_at,EXCLUDED.retail_verified_at),
    received_at = now()
  RETURNING id INTO result_id;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.stage_verified_vendor_offer(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_verified_vendor_offer(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz) TO service_role;
