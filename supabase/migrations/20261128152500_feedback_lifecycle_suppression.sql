-- Read-only legacy ownership guard for project lifecycle candidates.
-- Existing satisfaction records block new timeline delivery even if unanswered:
-- the legacy sender may already own the survey or have an uncertain outcome.
CREATE FUNCTION public.feedback_project_legacy_suppression(p_org uuid,p_project uuid,p_timeline text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE survey text;
BEGIN
 survey := CASE p_timeline WHEN 'job_completion' THEN 'job_completion'
 WHEN 'test_tune' THEN 'post_test_tune' WHEN 'one_year' THEN 'one_year' ELSE NULL END;
 IF survey IS NULL THEN RETURN 'invalid_candidate'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project AND organization_id=p_org)
 THEN RETURN 'missing_source'; END IF;
 IF EXISTS (SELECT 1 FROM public.customer_satisfaction s WHERE s.organization_id=p_org
 AND s.project_id=p_project AND s.survey_type::text=survey AND s.rating IS NOT NULL)
 THEN RETURN 'customer_responded'; END IF;
 IF EXISTS (SELECT 1 FROM public.customer_satisfaction s WHERE s.organization_id=p_org
 AND s.project_id=p_project AND s.survey_type::text=survey)
 THEN RETURN 'legacy_survey_exists'; END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.feedback_project_legacy_suppression(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_project_legacy_suppression(uuid,uuid,text) TO service_role;
