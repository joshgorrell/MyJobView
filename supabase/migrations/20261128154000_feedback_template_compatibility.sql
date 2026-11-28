-- Only verified existing catalog types are selectable; other timelines remain
-- unavailable until their existing dedicated renderers are adapted.
CREATE FUNCTION public.feedback_template_compatible(p_timeline text,p_template text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce((p_timeline='job_completion' AND p_template='job_completion_survey')
 OR (p_timeline='service_completion' AND p_template='work_order_feedback'),false);
$$;
REVOKE ALL ON FUNCTION public.feedback_template_compatible(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.feedback_template_compatible(text,text) TO authenticated,service_role;
CREATE FUNCTION public.validate_feedback_template_selection()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE step jsonb;
BEGIN
 FOR step IN SELECT value FROM jsonb_array_elements(NEW.steps) LOOP
 IF NOT public.feedback_template_compatible(NEW.timeline_key,step->>'template_key')
 OR NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.organization_id=NEW.organization_id
 AND t.template_type::text=step->>'template_key' AND t.is_active IS TRUE)
 THEN RAISE EXCEPTION 'Choose an active compatible feedback template'; END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_feedback_template_selection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_feedback_template_selection BEFORE INSERT OR UPDATE ON public.feedback_timeline_drafts
FOR EACH ROW EXECUTE FUNCTION public.validate_feedback_template_selection();
