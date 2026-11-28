-- Unattached adapter: no production trigger, backfill or delivery.
CREATE OR REPLACE FUNCTION public.capture_feedback_project_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  action text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  action := public.feedback_project_milestone_transition(
    OLD.substantial_completion_date::date, NEW.substantial_completion_date::date, CURRENT_DATE);
  IF action = 'record' THEN
    INSERT INTO public.feedback_timeline_events
      (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
    VALUES (NEW.organization_id,'job_completion',NEW.id,gen_random_uuid()::text,
      NEW.substantial_completion_date::date::timestamp AT TIME ZONE 'UTC');
  ELSIF action = 'cancel' THEN
    UPDATE public.feedback_timeline_events
    SET cancelled_at=clock_timestamp(), cancellation_reason='completion_milestone_removed_or_deferred'
    WHERE organization_id=NEW.organization_id AND timeline_key='job_completion'
      AND source_id=NEW.id AND cancelled_at IS NULL;
  ELSIF action = 'correct' THEN
    UPDATE public.feedback_timeline_events
    SET occurred_at=NEW.substantial_completion_date::date::timestamp AT TIME ZONE 'UTC'
    WHERE organization_id=NEW.organization_id AND timeline_key='job_completion'
      AND source_id=NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_feedback_project_completion() FROM PUBLIC, anon, authenticated;
