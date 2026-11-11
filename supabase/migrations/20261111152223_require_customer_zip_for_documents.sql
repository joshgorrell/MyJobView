-- ZIP-only creation requirement. Street addresses remain optional for new construction.
CREATE OR REPLACE FUNCTION private.require_document_customer_zip()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n jsonb := to_jsonb(NEW); o jsonb; customer_zip text; location_zip text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    IF (n->>'contact_id',n->>'customer_location_id',n->>'jobsite_zip')
       IS NOT DISTINCT FROM (o->>'contact_id',o->>'customer_location_id',o->>'jobsite_zip') THEN RETURN NEW; END IF;
  END IF;
  SELECT c.zip_code INTO customer_zip FROM public.contacts c
    WHERE c.id = nullif(n->>'contact_id','')::uuid AND c.organization_id = nullif(n->>'organization_id','')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer must belong to the document organization' USING ERRCODE='23514'; END IF;
  IF n->>'customer_location_id' IS NOT NULL THEN
    SELECT l.zip_code INTO location_zip FROM public.customer_locations l
      WHERE l.id = (n->>'customer_location_id')::uuid AND l.customer_contact_id = (n->>'contact_id')::uuid;
  END IF;
  -- A selected customer location or explicit transaction destination may supply the ZIP.
  IF btrim(coalesce(location_zip,'')) ~ '^[0-9]{5}(-[0-9]{4})?$'
     OR btrim(coalesce(n->>'jobsite_zip','')) ~ '^[0-9]{5}(-[0-9]{4})?$'
     OR btrim(coalesce(customer_zip,'')) ~ '^[0-9]{5}(-[0-9]{4})?$' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'A valid customer or transaction ZIP code is required before creating a proposal or invoice. Add the ZIP and try again.' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION private.require_document_customer_zip() FROM PUBLIC;
CREATE TRIGGER zz_require_customer_zip BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION private.require_document_customer_zip();
CREATE TRIGGER zz_require_customer_zip BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.require_document_customer_zip();
