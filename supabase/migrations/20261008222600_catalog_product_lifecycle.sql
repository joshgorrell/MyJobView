-- Archive uses the existing is_active flag. Discontinued products may still be sold,
-- and purchasing can explicitly override vendor availability. Existing document lines remain editable.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_discontinued boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.products.is_discontinued IS 'Supplier discontinued; remaining stock may be sold and purchasing may explicitly override vendor availability.';
COMMENT ON COLUMN public.products.is_active IS 'False archives the product and prevents new catalog selection; historical references are retained.';

-- Protect operational usage even when the user cannot see the referencing row through RLS.
-- Owned catalog defaults and empty inventory may still be cleaned up for an unused product.
DO $$
DECLARE r record; definition text;
BEGIN
  FOR r IN SELECT c.oid,c.conrelid,c.conname,cl.relname
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE c.contype='f' AND c.confrelid='public.products'::regclass AND ns.nspname='public'
      AND cl.relname NOT IN ('catalog_item_default_tasks','product_inventory')
  LOOP
    definition := regexp_replace(pg_get_constraintdef(r.oid), ' ON DELETE (SET NULL|SET DEFAULT|CASCADE|NO ACTION|RESTRICT)', '', 'g');
    -- Place the action before any deferrability clause (including future constraints).
    definition := regexp_replace(definition, ' (DEFERRABLE|NOT DEFERRABLE)', ' ON DELETE RESTRICT \1');
    IF definition NOT LIKE '%ON DELETE RESTRICT%' THEN definition := definition || ' ON DELETE RESTRICT'; END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.conrelid::regclass,r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.conrelid::regclass,r.conname,definition);
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
-- Trigger-only SECURITY DEFINER check: bypass inventory RLS so hidden stock cannot be lost.
-- Product DELETE remains authorized by the existing product RLS policies.
CREATE OR REPLACE FUNCTION private.protect_product_stock_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND organization_id=OLD.organization_id) THEN
      RAISE EXCEPTION 'Product is not available in your organization.' USING ERRCODE='42501';
    END IF;
  ELSIF current_setting('request.jwt.claim.role',true) IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM public.product_inventory WHERE product_id=OLD.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.product_inventory WHERE product_id=OLD.id
      AND (COALESCE(quantity_on_hand,0)<>0 OR COALESCE(quantity_reserved,0)<>0)) THEN
    RAISE EXCEPTION 'This product has stock or reservations and cannot be deleted. Archive it instead.' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.protect_product_stock_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_product_stock_delete ON public.products;
CREATE TRIGGER protect_product_stock_delete BEFORE DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION private.protect_product_stock_delete();

ALTER TABLE public.po_items ADD COLUMN IF NOT EXISTS discontinued_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.po_items ADD COLUMN IF NOT EXISTS discontinued_override_by uuid;
ALTER TABLE public.po_items ADD COLUMN IF NOT EXISTS discontinued_override_at timestamptz;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS discontinued_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS discontinued_override_by uuid;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS discontinued_override_at timestamptz;

-- A database guard covers direct APIs, cached selectors, packages, and alternate entry points.
CREATE OR REPLACE FUNCTION public.check_catalog_product_availability() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE product public.products%ROWTYPE; same_document boolean := false;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    same_document := CASE TG_TABLE_NAME
      WHEN 'proposal_line_items' THEN to_jsonb(NEW)->>'proposal_id' IS NOT DISTINCT FROM to_jsonb(OLD)->>'proposal_id'
      WHEN 'invoice_line_items' THEN to_jsonb(NEW)->>'invoice_id' IS NOT DISTINCT FROM to_jsonb(OLD)->>'invoice_id'
      WHEN 'change_order_line_items' THEN to_jsonb(NEW)->>'change_order_id' IS NOT DISTINCT FROM to_jsonb(OLD)->>'change_order_id'
      ELSE to_jsonb(NEW)->>'po_id' IS NOT DISTINCT FROM to_jsonb(OLD)->>'po_id' END;
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id AND same_document THEN
      IF TG_TABLE_NAME NOT IN ('po_items','purchase_order_items') THEN RETURN NEW; END IF;
      IF NEW.discontinued_override IS NOT DISTINCT FROM OLD.discontinued_override AND
        COALESCE((to_jsonb(NEW)->>'quantity')::numeric,(to_jsonb(NEW)->>'quantity_ordered')::numeric,0) <= COALESCE((to_jsonb(OLD)->>'quantity')::numeric,(to_jsonb(OLD)->>'quantity_ordered')::numeric,0) THEN
        NEW.discontinued_override_by := OLD.discontinued_override_by;
        NEW.discontinued_override_at := OLD.discontinued_override_at;
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  -- Serialize selection against archive/discontinue updates and deletion.
  SELECT * INTO product FROM public.products WHERE id=NEW.product_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is not available.' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)->>'organization_id') IS NOT NULL AND
     (to_jsonb(NEW)->>'organization_id')::uuid IS DISTINCT FROM product.organization_id THEN
    RAISE EXCEPTION 'Product is not available in your organization.' USING ERRCODE='42501';
  END IF;
  IF product.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Archived products cannot be added. Choose an active product.' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME IN ('po_items','purchase_order_items') AND product.is_discontinued THEN
    IF NOT (NEW.discontinued_override OR COALESCE(current_setting('app.discontinued_purchase_override',true),'false')='true') THEN
      RAISE EXCEPTION 'Discontinued product: purchasing must explicitly override after confirming vendor stock.' USING ERRCODE='23514';
    END IF;
    IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required for discontinued override.' USING ERRCODE='42501'; END IF;
    NEW.discontinued_override := true;
    NEW.discontinued_override_by := auth.uid();
    NEW.discontinued_override_at := now();
  END IF;
  IF TG_TABLE_NAME IN ('po_items','purchase_order_items') AND NOT product.is_discontinued THEN
    NEW.discontinued_override := false;
    NEW.discontinued_override_by := NULL;
    NEW.discontinued_override_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_catalog_product_availability() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['proposal_line_items','invoice_line_items','change_order_line_items','po_items','purchase_order_items'] LOOP
    IF to_regclass('public.'||name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_check_catalog_product_availability ON public.%I',name);
      EXECUTE format('CREATE TRIGGER zz_check_catalog_product_availability BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.check_catalog_product_availability()',name);
    END IF;
  END LOOP;
END $$;

-- Keep the established atomic request/PO builder and its existing tenant checks.
-- Its explicit header choice is carried to the line guard only inside this transaction.
DO $$
DECLARE definition text; anchor text := 'IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION ''Purchasing permission required''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.create_request_purchase_document(jsonb,uuid[],uuid,boolean,jsonb,uuid)'::regprocedure) INTO definition;
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Purchasing builder changed; review lifecycle override integration.'; END IF;
  definition := replace(definition,anchor,anchor || E'\n PERFORM set_config(''app.discontinued_purchase_override'',coalesce((p_header->>''discontinued_override'')::boolean,false)::text,true);');
  definition := replace(definition,'IF FOUND THEN RETURN doc; END IF;', 'IF FOUND THEN PERFORM set_config(''app.discontinued_purchase_override'',''false'',true); RETURN doc; END IF;');
  -- Reset the transaction-local choice at the normal completion boundary.
  definition := replace(definition,'RETURN doc;' || E'\nEND', 'PERFORM set_config(''app.discontinued_purchase_override'',''false'',true); RETURN doc;' || E'\nEND');
  EXECUTE definition;
END $$;

-- Existing callers keep the two-argument conversion. Purchasing UI uses this explicit override overload.
CREATE OR REPLACE FUNCTION public.convert_purchase_quote(p_quote_id uuid,p_vendor_id uuid,p_discontinued_override boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE document_id uuid;
BEGIN
  IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required'; END IF;
  PERFORM set_config('app.discontinued_purchase_override',coalesce(p_discontinued_override,false)::text,true);
  document_id := public.convert_purchase_quote(p_quote_id,p_vendor_id);
  PERFORM set_config('app.discontinued_purchase_override','false',true);
  RETURN document_id;
END $$;
REVOKE ALL ON FUNCTION public.convert_purchase_quote(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_purchase_quote(uuid,uuid,boolean) TO authenticated;
