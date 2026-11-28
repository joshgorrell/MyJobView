-- Pure dry-run milestone calculation. No scan, scheduler or enrollment.
CREATE OR REPLACE FUNCTION public.feedback_future_milestone_date(
  timeline_key text, substantial_completion date, test_tune_end date
) RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
   WHEN timeline_key = 'test_tune' AND isfinite(test_tune_end) THEN test_tune_end
   WHEN timeline_key = 'one_year' AND isfinite(substantial_completion)
     THEN (substantial_completion + interval '1 year')::date
   ELSE NULL
 END
$$;
REVOKE ALL ON FUNCTION public.feedback_future_milestone_date(text,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_future_milestone_date(text,date,date) TO service_role;

-- Eligibility is bounded by explicit activation and a limited catch-up window.
-- The caller must also prove a post-activation source occurrence.
CREATE OR REPLACE FUNCTION public.feedback_milestone_due(
  milestone date, activation_date date, as_of_date date, catchup_days integer
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT coalesce(isfinite(milestone) AND isfinite(activation_date) AND isfinite(as_of_date)
   AND catchup_days BETWEEN 0 AND 30
   AND milestone >= activation_date AND milestone <= as_of_date
   AND (as_of_date - milestone) <= catchup_days, false)
$$;
REVOKE ALL ON FUNCTION public.feedback_milestone_due(date,date,date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_milestone_due(date,date,date,integer) TO service_role;
