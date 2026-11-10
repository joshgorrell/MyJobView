-- Existing LeadForm historically stored the Contact relationship in converted_from_contact_id.
-- #579 introduced contact_id, but its email-only backfill misses leads with no email
-- and can be wrong when contact details have changed. Prefer the explicit link.
UPDATE public.leads
SET contact_id = converted_from_contact_id
WHERE converted_from_contact_id IS NOT NULL
  AND contact_id IS DISTINCT FROM converted_from_contact_id;

-- Keep both relationship columns synchronized for older Lead entry points.
CREATE OR REPLACE FUNCTION public.sync_lead_contact_relationship()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.converted_from_contact_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.converted_from_contact_id IS DISTINCT FROM OLD.converted_from_contact_id) THEN
    NEW.contact_id := NEW.converted_from_contact_id;
  ELSIF NEW.contact_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
    NEW.converted_from_contact_id := NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_lead_contact_relationship ON public.leads;
CREATE TRIGGER trg_sync_lead_contact_relationship BEFORE INSERT OR UPDATE OF contact_id, converted_from_contact_id
ON public.leads FOR EACH ROW EXECUTE FUNCTION public.sync_lead_contact_relationship();
