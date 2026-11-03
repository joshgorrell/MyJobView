-- Enforce customer assignments, including trusted imports and ownership changes.
CREATE OR REPLACE FUNCTION public.validate_customer_owner_office() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.contact_type IS NOT DISTINCT FROM OLD.contact_type AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to AND NEW.office_id IS NOT DISTINCT FROM OLD.office_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN RETURN NEW;END IF;
 IF NEW.contact_type IS NULL OR NEW.contact_type NOT IN ('lead','prospect','person','business') THEN RAISE EXCEPTION 'Valid contact type required' USING ERRCODE='23514';END IF;
 IF NEW.contact_type IN ('person','business') AND (NEW.organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.assigned_to AND p.organization_id=NEW.organization_id AND p.is_active AND p.role NOT IN ('portal_user','customer')) OR NOT EXISTS(SELECT 1 FROM public.company_offices o WHERE o.id=NEW.office_id AND o.organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Customers require an active representative and office in their organization' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_customer_owner_office() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_customer_owner_office_trigger BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.validate_customer_owner_office();
