-- Proposal conversion must identify an opportunity, not close every Lead for
-- the same Contact. Keep one trigger responsible for conversion and attribution.
CREATE OR REPLACE FUNCTION private.convert_lead_on_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidates uuid[];
  v_lead_id uuid;
  v_converted_at timestamptz := coalesce(NEW.created_at, now());
BEGIN
  IF NEW.is_revision OR NEW.organization_id IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Explicit links take precedence. Without one, only an unambiguous open Lead
  -- may be inferred. Lock candidates consistently before recording conversion.
  SELECT array_agg(candidate.id) INTO v_candidates
  FROM (
    SELECT l.id FROM public.leads l
    WHERE l.organization_id = NEW.organization_id
      AND (l.contact_id = NEW.contact_id OR l.converted_from_contact_id = NEW.contact_id)
      AND (NEW.lead_id IS NULL OR l.id = NEW.lead_id)
      AND l.converted_at IS NULL
      AND l.status NOT IN ('closed_won', 'closed_lost')
      AND l.created_at <= v_converted_at
      AND EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = NEW.contact_id AND c.organization_id = NEW.organization_id
      )
    ORDER BY l.id
    FOR UPDATE
  ) candidate;

  IF coalesce(cardinality(v_candidates), 0) <> 1 THEN
    RETURN NEW;
  END IF;
  v_lead_id := v_candidates[1];

  INSERT INTO public.lead_conversions
    (organization_id, lead_id, contact_id, conversion_type, source_id, converted_at)
  VALUES
    (NEW.organization_id, v_lead_id, NEW.contact_id, 'proposal', NEW.id, v_converted_at)
  ON CONFLICT (lead_id) DO NOTHING;

  UPDATE public.leads
  SET converted_at = v_converted_at, updated_at = now()
  WHERE id = v_lead_id AND organization_id = NEW.organization_id
    AND converted_at IS NULL;

  IF NEW.lead_id IS NULL THEN
    UPDATE public.proposals SET lead_id = v_lead_id
    WHERE id = NEW.id AND organization_id = NEW.organization_id AND lead_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- The old public trigger competed with the contact-wide conversion trigger.
-- Keeping both caused unrelated Leads to close and dropped inferred attribution.
DROP TRIGGER IF EXISTS trg_mark_lead_converted_on_proposal ON public.proposals;
DROP TRIGGER IF EXISTS trg_convert_lead_on_proposal ON public.proposals;
CREATE TRIGGER trg_convert_lead_on_proposal
AFTER INSERT OR UPDATE OF contact_id, lead_id ON public.proposals
FOR EACH ROW EXECUTE FUNCTION private.convert_lead_on_proposal();
