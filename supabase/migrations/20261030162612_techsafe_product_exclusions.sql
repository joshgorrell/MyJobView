-- Techsafe opt-outs are separate from existing product/tax classifications.
-- Keep catalog rows untouched: catalog UPDATEs run pricing/tracking triggers.
CREATE SCHEMA IF NOT EXISTS techsafe_source;
REVOKE ALL ON SCHEMA techsafe_source FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA techsafe_source TO authenticated;

-- Written only by future trusted pairing/health workers. Missing means off.
-- No browser role can assert that the remote connection is working.
CREATE TABLE techsafe_source.integration_connections (
  organization_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('active','paused','revoked','disconnected')),
  last_verified_at timestamptz
);
ALTER TABLE techsafe_source.integration_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.integration_connections FROM PUBLIC,anon,authenticated;

CREATE TABLE techsafe_source.product_exclusions (
  -- Preserve source identity on catalog deletion without changing delete rules.
  product_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  excluded boolean NOT NULL DEFAULT true,
  miscellaneous_placeholder boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT miscellaneous_placeholder OR excluded)
);
ALTER TABLE techsafe_source.product_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.product_exclusions FROM PUBLIC,anon,authenticated;
INSERT INTO techsafe_source.product_exclusions(product_id,organization_id,excluded,miscellaneous_placeholder)
SELECT id,organization_id,true,true FROM public.products
WHERE organization_id IS NOT NULL AND (
  upper(btrim(coalesce(sku,'')))='MISC-ITEM'
  OR lower(btrim(coalesce(name,''))) IN ('miscellaneous item','misc item')
);

CREATE FUNCTION techsafe_source.track_miscellaneous_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recognized boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    IF current_setting('role',true) IN ('anon','authenticated')
      OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
    AND p.organization_id=NEW.organization_id AND p.is_active IS TRUE
    AND (p.role='admin' OR p.can_edit_products IS TRUE)) THEN
    RAISE EXCEPTION 'Active product editor in this organization required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Product ownership cannot be transferred' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM techsafe_source.product_exclusions c
    WHERE c.product_id=NEW.id AND c.organization_id IS DISTINCT FROM NEW.organization_id) THEN
    RAISE EXCEPTION 'Product identity belongs to another organization' USING ERRCODE='42501';
  END IF;
  recognized:=upper(btrim(coalesce(NEW.sku,'')))='MISC-ITEM'
    OR lower(btrim(coalesce(NEW.name,''))) IN ('miscellaneous item','misc item');
  IF TG_OP='UPDATE' THEN
    recognized:=recognized OR upper(btrim(coalesce(OLD.sku,'')))='MISC-ITEM'
      OR lower(btrim(coalesce(OLD.name,''))) IN ('miscellaneous item','misc item');
  END IF;
  IF recognized AND NEW.organization_id IS NOT NULL THEN
    INSERT INTO techsafe_source.product_exclusions(product_id,organization_id,excluded,miscellaneous_placeholder,updated_by)
    VALUES(NEW.id,NEW.organization_id,true,true,auth.uid())
    ON CONFLICT(product_id) DO UPDATE SET excluded=true,miscellaneous_placeholder=true,updated_by=auth.uid(),updated_at=now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.track_miscellaneous_product() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER track_techsafe_miscellaneous_product
  AFTER INSERT OR UPDATE OF name,sku,organization_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION techsafe_source.track_miscellaneous_product();

CREATE FUNCTION techsafe_source.get_product_exclusion(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products%ROWTYPE; saved techsafe_source.product_exclusions%ROWTYPE; automatic boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public.products product WHERE product.id=p_product_id
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND p.organization_id=product.organization_id AND p.is_active IS TRUE);
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is not available in your organization' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM techsafe_source.integration_connections c
    WHERE c.organization_id=item.organization_id AND c.enabled AND c.status='active'
      AND c.last_verified_at > now()-interval '5 minutes' AND c.last_verified_at <= now()) THEN
    RETURN jsonb_build_object('available',false);
  END IF;
  SELECT * INTO saved FROM techsafe_source.product_exclusions WHERE product_id=item.id AND organization_id=item.organization_id;
  automatic:=coalesce(saved.miscellaneous_placeholder,false)
    OR upper(btrim(coalesce(item.sku,'')))='MISC-ITEM'
    OR lower(btrim(coalesce(item.name,''))) IN ('miscellaneous item','misc item');
  RETURN jsonb_build_object('available',true,'product_id',item.id,'excluded',automatic OR coalesce(saved.excluded,false),'automatic',automatic);
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.get_product_exclusion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION techsafe_source.get_product_exclusion(uuid) TO authenticated;

CREATE FUNCTION techsafe_source.set_product_exclusion(p_product_id uuid,p_excluded boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products%ROWTYPE; saved techsafe_source.product_exclusions%ROWTYPE; automatic boolean; actor uuid;
BEGIN
  actor:=auth.uid();
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_excluded IS NULL THEN RAISE EXCEPTION 'Exclusion choice required' USING ERRCODE='22023'; END IF;
  -- Consistent lock order with catalog edits: product first, exclusion second.
  SELECT * INTO item FROM public.products product WHERE product.id=p_product_id
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor
      AND p.organization_id=product.organization_id AND p.is_active IS TRUE
      AND (p.role='admin' OR p.can_edit_products IS TRUE)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is not available to an active editor in your organization' USING ERRCODE='42501'; END IF;
  -- Hold this connection row through commit; pause/disconnect must serialize
  -- with this operation rather than race a prior UI status check.
  PERFORM 1 FROM techsafe_source.integration_connections c
    WHERE c.organization_id=item.organization_id AND c.enabled AND c.status='active'
      AND c.last_verified_at > now()-interval '5 minutes' AND c.last_verified_at <= now()
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Techsafe integration is not enabled and verified' USING ERRCODE='55000'; END IF;
  SELECT * INTO saved FROM techsafe_source.product_exclusions WHERE product_id=item.id FOR UPDATE;
  IF FOUND AND saved.organization_id IS DISTINCT FROM item.organization_id THEN
    RAISE EXCEPTION 'Product identity belongs to another organization' USING ERRCODE='42501';
  END IF;
  automatic:=coalesce(saved.miscellaneous_placeholder,false)
    OR upper(btrim(coalesce(item.sku,'')))='MISC-ITEM'
    OR lower(btrim(coalesce(item.name,''))) IN ('miscellaneous item','misc item');
  IF automatic AND NOT p_excluded THEN
    RAISE EXCEPTION 'Miscellaneous items are always excluded from Techsafe' USING ERRCODE='22023';
  END IF;
  INSERT INTO techsafe_source.product_exclusions(product_id,organization_id,excluded,miscellaneous_placeholder,updated_by)
  VALUES(item.id,item.organization_id,p_excluded,automatic,actor)
  ON CONFLICT(product_id) DO UPDATE SET excluded=EXCLUDED.excluded,miscellaneous_placeholder=EXCLUDED.miscellaneous_placeholder,updated_by=EXCLUDED.updated_by,updated_at=now();
  RETURN jsonb_build_object('available',true,'product_id',item.id,'excluded',p_excluded,'automatic',automatic);
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.set_product_exclusion(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION techsafe_source.set_product_exclusion(uuid,boolean) TO authenticated;

CREATE FUNCTION public.get_techsafe_product_exclusion(p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT techsafe_source.get_product_exclusion(p_product_id);
$$;
CREATE FUNCTION public.set_techsafe_product_exclusion(p_product_id uuid,p_excluded boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT techsafe_source.set_product_exclusion(p_product_id,p_excluded);
$$;
REVOKE ALL ON FUNCTION public.get_techsafe_product_exclusion(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_techsafe_product_exclusion(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_techsafe_product_exclusion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_techsafe_product_exclusion(uuid,boolean) TO authenticated;
