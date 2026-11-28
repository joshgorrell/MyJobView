-- Read-only preview of draft steps against inert events. Never sends or enrolls.
CREATE OR REPLACE FUNCTION public.preview_feedback_timeline_steps(
  p_organization_id uuid, p_as_of timestamptz, p_not_before timestamptz,
  p_limit integer DEFAULT 100
) RETURNS TABLE(event_id uuid, timeline_key text, step_number bigint, template_key text, due_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT e.id,e.timeline_key,s.ordinality,s.value->>'template_key',
   e.occurred_at + make_interval(days => (s.value->>'delay_days')::integer)
 FROM public.feedback_timeline_events e
 JOIN public.feedback_timeline_drafts d ON d.organization_id=e.organization_id AND d.timeline_key=e.timeline_key
 CROSS JOIN LATERAL jsonb_array_elements(d.steps) WITH ORDINALITY s(value,ordinality)
 WHERE e.organization_id=p_organization_id AND e.cancelled_at IS NULL
   AND e.timeline_key <> 'security_onboarding'
   AND p_as_of IS NOT NULL AND p_not_before IS NOT NULL
   AND isfinite(p_as_of) AND isfinite(p_not_before)
   AND p_not_before <= p_as_of
   AND e.recorded_at >= p_not_before AND e.recorded_at <= p_as_of
   AND e.occurred_at >= p_not_before
   AND e.occurred_at + make_interval(days => (s.value->>'delay_days')::integer) <= p_as_of
   AND e.occurred_at + make_interval(days => (s.value->>'delay_days')::integer) >= p_as_of - interval '30 days'
 ORDER BY 5,e.id,s.ordinality
 LIMIT greatest(0,least(coalesce(p_limit,0),100))
$$;
REVOKE ALL ON FUNCTION public.preview_feedback_timeline_steps(uuid,timestamptz,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_feedback_timeline_steps(uuid,timestamptz,timestamptz,integer) TO service_role;
GRANT SELECT ON public.feedback_timeline_drafts TO service_role;
COMMENT ON FUNCTION public.preview_feedback_timeline_steps(uuid,timestamptz,timestamptz,integer) IS
 'Read-only candidate preview, not send eligibility. Response suppression, template compatibility and legacy delivery ownership must be checked separately.';
