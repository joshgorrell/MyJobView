-- Draft-only validation. No delivery or scheduling changes.
CREATE OR REPLACE FUNCTION public.validate_feedback_timeline_draft()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  step jsonb;
  previous_day integer := -1;
  day_number integer;
BEGIN
  IF jsonb_typeof(NEW.steps) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.steps) > 12 THEN
    RAISE EXCEPTION 'A timeline must contain at most 12 steps';
  END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(NEW.steps) LOOP
    IF jsonb_typeof(step) IS DISTINCT FROM 'object'
       OR jsonb_typeof(step->'delay_days') IS DISTINCT FROM 'number'
       OR COALESCE(step->>'delay_days','') !~ '^[0-9]{1,3}$'
       OR jsonb_typeof(step->'template_key') IS DISTINCT FROM 'string'
       OR COALESCE(step->>'template_key','') !~ '^[a-zA-Z0-9_-]{1,100}$'
       OR (step - 'delay_days' - 'template_key') <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid timeline step';
    END IF;
    day_number := (step->>'delay_days')::integer;
    IF day_number > 365 OR day_number <= previous_day THEN
      RAISE EXCEPTION 'Timeline days must be strictly increasing between 0 and 365';
    END IF;
    previous_day := day_number;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_feedback_timeline_draft() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_feedback_timeline_draft
BEFORE INSERT OR UPDATE ON public.feedback_timeline_drafts
FOR EACH ROW EXECUTE FUNCTION public.validate_feedback_timeline_draft();
