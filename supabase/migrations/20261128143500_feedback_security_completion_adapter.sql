-- Detached adapter. Customer submission is not completed staff onboarding.
-- Capture first activation of a submitted agreement; cancel on leaving active.
CREATE OR REPLACE FUNCTION public.capture_feedback_security_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF OLD.status::text = 'approved' AND NEW.status::text = 'active'
     AND NEW.customer_completed_at IS NOT NULL THEN
    INSERT INTO public.feedback_timeline_events
      (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
    VALUES (NEW.organization_id,'security_onboarding',NEW.id,'initial_activation',clock_timestamp())
    ON CONFLICT (organization_id,timeline_key,source_id,occurrence_key) DO NOTHING;
  ELSIF OLD.status::text = 'active' AND NEW.status::text IS DISTINCT FROM 'active' THEN
    UPDATE public.feedback_timeline_events
    SET cancelled_at=clock_timestamp(), cancellation_reason='security_contract_left_active'
    WHERE organization_id=NEW.organization_id AND timeline_key='security_onboarding'
      AND source_id=NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_feedback_security_completion() FROM PUBLIC, anon, authenticated;
