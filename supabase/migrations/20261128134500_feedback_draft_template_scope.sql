-- Draft-only guard; no enrollment, scheduling or delivery.
CREATE OR REPLACE FUNCTION public.validate_feedback_draft_template_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.steps) AS step(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_templates t
      WHERE t.organization_id = NEW.organization_id
        AND t.template_type = step.value->>'template_key'
        AND t.is_active IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'Every draft step requires an active email template belonging to this organization';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_feedback_draft_template_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_feedback_draft_template_scope
BEFORE INSERT OR UPDATE ON public.feedback_timeline_drafts
FOR EACH ROW EXECUTE FUNCTION public.validate_feedback_draft_template_scope();
