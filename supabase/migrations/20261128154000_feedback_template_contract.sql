-- Dedicated draft template contract. Existing templates and senders are unchanged.
CREATE FUNCTION public.feedback_template_compatible(p_timeline text,p_template text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(p_timeline IN ('proposal_check','lost_opportunity','job_completion','service_completion','support_completion','test_tune','one_year')
 AND p_template = 'feedback_' || p_timeline,false)
$$;
CREATE FUNCTION public.validate_feedback_template_compatibility()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.steps) s
 WHERE NOT public.feedback_template_compatible(NEW.timeline_key,s->>'template_key'))
 THEN RAISE EXCEPTION 'Choose a dedicated template for this feedback timeline'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_feedback_template_compatibility BEFORE INSERT OR UPDATE
 ON public.feedback_timeline_drafts FOR EACH ROW EXECUTE FUNCTION public.validate_feedback_template_compatibility();
