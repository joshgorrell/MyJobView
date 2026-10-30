-- Separate integration records avoid firing catalog price/tracking triggers.
CREATE SCHEMA IF NOT EXISTS techsafe_source;
REVOKE ALL ON SCHEMA techsafe_source FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA techsafe_source TO authenticated;

CREATE TABLE techsafe_source.product_classifications (
  -- Retain identity if an unused catalog row is deleted; UUID reuse cannot
  -- reset a miscellaneous exclusion. No FK changes catalog deletion behavior.
  product_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  product_kind text NOT NULL DEFAULT 'unclassified'
    CHECK (product_kind IN ('equipment','miscellaneous','labor','fee','tax','consumable','subscription','unclassified')),
  miscellaneous_placeholder boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT miscellaneous_placeholder OR product_kind='miscellaneous')
);
ALTER TABLE techsafe_source.product_classifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.product_classifications FROM PUBLIC,anon,authenticated;

-- Seed only known placeholders, without updating a single catalog product.
INSERT INTO techsafe_source.product_classifications(product_id,organization_id,product_kind,miscellaneous_placeholder)
SELECT id,organization_id,'miscellaneous',true FROM public.products
WHERE organization_id IS NOT NULL AND (
  upper(btrim(coalesce(sku,'')))='MISC-ITEM'
  OR lower(btrim(coalesce(name,''))) IN ('miscellaneous item','misc item')
);

-- Trigger keeps placeholder identity even through a rename. It never changes NEW.
-- Existing product permissions remain authoritative; duplicate the tenant check
-- inside this narrow privileged write boundary as defense in depth.
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
  IF EXISTS (SELECT 1 FROM techsafe_source.product_classifications c
    WHERE c.product_id=NEW.id AND c.organization_id IS DISTINCT FROM NEW.organization_id) THEN
    RAISE EXCEPTION 'Product identity belongs to another organization' USING ERRCODE='42501';
  END IF;
  recognized := upper(btrim(coalesce(NEW.sku,'')))='MISC-ITEM'
    OR lower(btrim(coalesce(NEW.name,''))) IN ('miscellaneous item','misc item');
  IF TG_OP='UPDATE' THEN
    recognized := recognized OR upper(btrim(coalesce(OLD.sku,'')))='MISC-ITEM'
      OR lower(btrim(coalesce(OLD.name,''))) IN ('miscellaneous item','misc item');
  END IF;
  IF recognized AND NEW.organization_id IS NOT NULL THEN
    INSERT INTO techsafe_source.product_classifications
      (product_id,organization_id,product_kind,miscellaneous_placeholder,updated_by)
    VALUES (NEW.id,NEW.organization_id,'miscellaneous',true,auth.uid())
    ON CONFLICT (product_id) DO UPDATE SET product_kind='miscellaneous',
      miscellaneous_placeholder=true,updated_by=auth.uid(),updated_at=now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.track_miscellaneous_product() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER track_techsafe_miscellaneous_product
  AFTER INSERT OR UPDATE OF name,sku,organization_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION techsafe_source.track_miscellaneous_product();

CREATE FUNCTION techsafe_source.classify_product(p_product_id uuid,p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products%ROWTYPE; actor uuid; prior techsafe_source.product_classifications%ROWTYPE;
  result techsafe_source.product_classifications%ROWTYPE; sticky boolean;
BEGIN
  actor:=auth.uid();
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('equipment','miscellaneous','labor','fee','tax','consumable','subscription','unclassified') THEN
    RAISE EXCEPTION 'Invalid Techsafe product classification' USING ERRCODE='22023';
  END IF;
  -- Lock product first, matching the normal product update/trigger lock order.
  SELECT * INTO item FROM public.products product WHERE product.id=p_product_id
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=actor
      AND p.organization_id=product.organization_id AND p.is_active IS TRUE
      AND (p.role='admin' OR p.can_edit_products IS TRUE)) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product is not available to an active editor in your organization' USING ERRCODE='42501';
  END IF;
  SELECT * INTO prior FROM techsafe_source.product_classifications WHERE product_id=item.id FOR UPDATE;
  IF FOUND AND prior.organization_id IS DISTINCT FROM item.organization_id THEN
    RAISE EXCEPTION 'Product identity belongs to another organization' USING ERRCODE='42501';
  END IF;
  sticky:=coalesce(prior.miscellaneous_placeholder,false) OR prior.product_kind='miscellaneous'
    OR upper(btrim(coalesce(item.sku,'')))='MISC-ITEM'
    OR lower(btrim(coalesce(item.name,''))) IN ('miscellaneous item','misc item');
  sticky:=coalesce(sticky,false) OR p_kind='miscellaneous';
  IF sticky AND p_kind<>'miscellaneous' THEN
    RAISE EXCEPTION 'Miscellaneous placeholders cannot be classified as covered equipment or reclassified' USING ERRCODE='22023';
  END IF;
  INSERT INTO techsafe_source.product_classifications(product_id,organization_id,product_kind,miscellaneous_placeholder,updated_by)
  VALUES(item.id,item.organization_id,p_kind,sticky,actor)
  ON CONFLICT(product_id) DO UPDATE SET product_kind=EXCLUDED.product_kind,
    miscellaneous_placeholder=EXCLUDED.miscellaneous_placeholder,updated_by=EXCLUDED.updated_by,updated_at=now()
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.classify_product(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION techsafe_source.classify_product(uuid,text) TO authenticated;

CREATE FUNCTION public.classify_techsafe_product(p_product_id uuid,p_kind text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT techsafe_source.classify_product(p_product_id,p_kind);
$$;
REVOKE ALL ON FUNCTION public.classify_techsafe_product(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.classify_techsafe_product(uuid,text) TO authenticated;
