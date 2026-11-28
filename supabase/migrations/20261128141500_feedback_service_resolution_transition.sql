-- Pure transition classifier, deliberately not attached to a live trigger.
-- Service request closure, not work order completion, is the source event.
CREATE OR REPLACE FUNCTION public.feedback_service_resolution_transition(previous_status text, next_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
   WHEN previous_status IS NULL OR next_status IS NULL THEN NULL
   WHEN previous_status = next_status THEN NULL
   WHEN previous_status = 'cancelled' THEN NULL
   WHEN next_status = 'closed' THEN 'record'
   WHEN previous_status = 'closed' THEN 'cancel'
   ELSE NULL
 END
$$;
REVOKE ALL ON FUNCTION public.feedback_service_resolution_transition(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_service_resolution_transition(text,text) TO service_role;
