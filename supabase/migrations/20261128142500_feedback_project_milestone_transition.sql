-- Pure milestone classifier. No production trigger or historical scan.
CREATE OR REPLACE FUNCTION public.feedback_project_milestone_transition(previous_date date, next_date date, as_of_date date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
   WHEN as_of_date IS NULL OR NOT isfinite(as_of_date) THEN NULL
   WHEN previous_date IS NOT DISTINCT FROM next_date THEN NULL
   WHEN next_date IS NOT NULL AND isfinite(next_date) AND next_date <= as_of_date
     AND (previous_date IS NULL OR NOT isfinite(previous_date) OR previous_date > as_of_date) THEN 'record'
   WHEN previous_date IS NOT NULL AND isfinite(previous_date) AND previous_date <= as_of_date
     AND (next_date IS NULL OR NOT isfinite(next_date) OR next_date > as_of_date) THEN 'cancel'
   WHEN previous_date IS NOT NULL AND isfinite(previous_date) AND previous_date <= as_of_date
     AND next_date IS NOT NULL AND isfinite(next_date) AND next_date <= as_of_date THEN 'correct'
   ELSE NULL
 END
$$;
REVOKE ALL ON FUNCTION public.feedback_project_milestone_transition(date,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_project_milestone_transition(date,date,date) TO service_role;
