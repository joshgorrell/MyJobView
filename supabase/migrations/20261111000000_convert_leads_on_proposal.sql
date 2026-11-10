-- A lead becomes a historical converted opportunity as soon as a proposal is created.
-- Preserve the lead record, source, owner and claim history; do not delete it.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_active_conversion ON public.leads (organization_id, created_at DESC) WHERE converted_at IS NULL;

CREATE OR REPLACE FUNCTION public.mark_lead_converted_on_proposal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads SET converted_at = COALESCE(converted_at, NEW.created_at, now()), updated_at = now()
    WHERE id = NEW.lead_id AND converted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mark_lead_converted_on_proposal ON public.proposals;
CREATE TRIGGER trg_mark_lead_converted_on_proposal
AFTER INSERT OR UPDATE OF lead_id ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.mark_lead_converted_on_proposal();

-- Backfill existing conversions, including draft proposals and approved Sales Orders.
UPDATE public.leads AS l SET converted_at = p.first_proposal_at
FROM (SELECT lead_id, MIN(created_at) AS first_proposal_at FROM public.proposals
      WHERE lead_id IS NOT NULL GROUP BY lead_id) AS p
WHERE l.id = p.lead_id AND l.converted_at IS NULL;
