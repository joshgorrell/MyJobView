-- A proposal created from Contacts has contact_id but usually no lead_id.
-- Link leads to their permanent Contact and convert only the matching opportunity.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_contact_active ON public.leads(contact_id) WHERE converted_at IS NULL;

-- Backfill a lead's Contact only when its nonblank email identifies exactly one Contact.
-- Ambiguous/no-email leads remain unlinked rather than risking the wrong customer.
WITH unique_emails AS (
  SELECT lower(btrim(email)) AS email_key, min(id::text)::uuid AS contact_id
  FROM public.contacts WHERE nullif(btrim(email), '') IS NOT NULL
  GROUP BY lower(btrim(email)) HAVING count(*) = 1
)
UPDATE public.leads l SET contact_id = u.contact_id
FROM unique_emails u
WHERE l.contact_id IS NULL AND lower(btrim(l.email)) = u.email_key;

CREATE OR REPLACE FUNCTION public.mark_lead_converted_on_proposal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  matched_lead_id uuid;
BEGIN
  matched_lead_id := NEW.lead_id;
  IF matched_lead_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    -- Do not close unrelated opportunities for the same Contact.
    -- Only auto-convert when exactly one active Lead belongs to the Contact.
    SELECT min(id::text)::uuid INTO matched_lead_id
    FROM public.leads
    WHERE contact_id = NEW.contact_id AND converted_at IS NULL
    HAVING count(*) = 1;
  END IF;
  IF matched_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET converted_at = COALESCE(converted_at, NEW.created_at, now()),
        contact_id = COALESCE(contact_id, NEW.contact_id), updated_at = now()
    WHERE id = matched_lead_id AND converted_at IS NULL;
    -- Preserve the opportunity link for attribution and conversion reporting.
    IF NEW.lead_id IS NULL THEN
      UPDATE public.proposals SET lead_id = matched_lead_id WHERE id = NEW.id AND lead_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Historical contact-created proposals: convert only unambiguous lead/contact pairs.
WITH single_leads AS (
 SELECT contact_id, min(id::text)::uuid AS lead_id
 FROM public.leads WHERE contact_id IS NOT NULL AND converted_at IS NULL
 GROUP BY contact_id HAVING count(*) = 1
), first_proposals AS (
 SELECT DISTINCT ON (p.contact_id) p.id, p.created_at, sl.lead_id
 FROM public.proposals p JOIN single_leads sl ON sl.contact_id = p.contact_id
 WHERE p.lead_id IS NULL
 ORDER BY p.contact_id, p.created_at ASC
)
UPDATE public.proposals p SET lead_id = f.lead_id
FROM first_proposals f WHERE p.id = f.id AND p.lead_id IS NULL;
