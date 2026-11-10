-- Contact type is a separate source of Leads in ContactsView.
-- Creating a proposal must also remove that Contact from the Leads filter,
-- even when there is no corresponding row in public.leads.
CREATE OR REPLACE FUNCTION public.convert_contact_lead_on_proposal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET contact_type = CASE
      WHEN nullif(btrim(company_name), '') IS NOT NULL THEN 'business'
      ELSE 'person'
    END
    WHERE id = NEW.contact_id AND contact_type = 'lead';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_convert_contact_lead_on_proposal ON public.proposals;
CREATE TRIGGER trg_convert_contact_lead_on_proposal
AFTER INSERT OR UPDATE OF contact_id ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.convert_contact_lead_on_proposal();

-- Correct historic Contacts that still show as Leads despite having proposals.
UPDATE public.contacts c
SET contact_type = CASE
  WHEN nullif(btrim(c.company_name), '') IS NOT NULL THEN 'business'
  ELSE 'person'
END
WHERE c.contact_type = 'lead'
  AND EXISTS (SELECT 1 FROM public.proposals p WHERE p.contact_id = c.id);
