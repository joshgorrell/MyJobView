-- Detached adapter for customer support tasks, never ordinary assignments.
CREATE OR REPLACE FUNCTION public.capture_feedback_support_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF OLD.is_support_request IS TRUE AND NEW.is_support_request IS TRUE
     AND NEW.contact_id IS NOT NULL AND NEW.contact_id IS NOT DISTINCT FROM OLD.contact_id
     AND OLD.status::text IS DISTINCT FROM 'completed' AND NEW.status::text = 'completed'
     AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.feedback_timeline_events
      (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
    VALUES (NEW.organization_id,'support_completion',NEW.id,gen_random_uuid()::text,NEW.completed_at);
  ELSIF OLD.is_support_request IS TRUE AND OLD.status::text = 'completed'
     AND (NEW.status::text IS DISTINCT FROM 'completed' OR NEW.is_support_request IS NOT TRUE
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
    UPDATE public.feedback_timeline_events
    SET cancelled_at=clock_timestamp(), cancellation_reason='support_resolution_invalidated'
    WHERE organization_id=NEW.organization_id AND timeline_key='support_completion'
      AND source_id=NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_feedback_support_resolution() FROM PUBLIC, anon, authenticated;
