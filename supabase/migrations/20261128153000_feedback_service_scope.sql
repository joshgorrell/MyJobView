-- Unattached trigger adapter. No production event capture until separately reviewed.
CREATE OR REPLACE FUNCTION public.capture_feedback_service_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  action text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  -- Project work requests are not customer service resolutions.
  IF NEW.request_type IS DISTINCT FROM 'service' OR NEW.contact_id IS NULL
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
    UPDATE public.feedback_timeline_events
    SET cancelled_at=clock_timestamp(), cancellation_reason='service_scope_invalidated'
    WHERE organization_id=NEW.organization_id AND timeline_key='service_completion'
      AND source_id=NEW.id AND cancelled_at IS NULL;
    RETURN NEW;
  END IF;
  IF OLD.request_type IS DISTINCT FROM 'service' THEN RETURN NEW; END IF;
  action := public.feedback_service_resolution_transition(OLD.status::text, NEW.status::text);
  IF action = 'record' THEN
    INSERT INTO public.feedback_timeline_events
      (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
    VALUES (NEW.organization_id,'service_completion',NEW.id,gen_random_uuid()::text,clock_timestamp());
  ELSIF action = 'cancel' THEN
    UPDATE public.feedback_timeline_events
    SET cancelled_at=clock_timestamp(), cancellation_reason='service_request_' || NEW.status::text
    WHERE organization_id=NEW.organization_id AND timeline_key='service_completion'
      AND source_id=NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_feedback_service_resolution() FROM PUBLIC, anon, authenticated;
-- No CREATE TRIGGER on production service_requests in this migration.
