-- A Prospect is a Contact. Creating a linked Lead must move that Contact out of
-- Prospects in the same transaction, regardless of which MJV entry point created it.
-- The existing contacts trigger derives is_prospect from contact_type.
CREATE OR REPLACE FUNCTION private.promote_prospect_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND NEW.organization_id IS NOT NULL THEN
    UPDATE public.contacts
       SET contact_type = 'lead'
     WHERE id = NEW.contact_id
       AND organization_id = NEW.organization_id
       AND contact_type = 'prospect';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_prospect_on_lead_insert ON public.leads;
CREATE TRIGGER trg_promote_prospect_on_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION private.promote_prospect_on_lead_insert();
