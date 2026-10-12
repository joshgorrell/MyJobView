-- Reuse proposal_activity; verified portal identities and one row per browser visit.
ALTER TABLE public.proposal_activity
  ADD COLUMN viewer_user_id uuid,
  ADD COLUMN visit_id uuid;
CREATE UNIQUE INDEX proposal_activity_visit_identity
  ON public.proposal_activity(viewer_user_id, visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX proposal_activity_viewer ON public.proposal_activity(viewer_user_id) WHERE viewer_user_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE FUNCTION private.proposal_engagement_customer(p_proposal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id
    WHERE p.id=p_proposal_id AND p.is_portal_visible
      AND c.portal_user_id=auth.uid() AND c.organization_id=p.organization_id
  ) AND NOT EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.role <> 'portal_user');
$$;
REVOKE ALL ON FUNCTION private.proposal_engagement_customer(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.proposal_engagement_customer(uuid) TO authenticated;

-- Remove permissive legacy policies, including anonymous insertion.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='proposal_activity'
  LOOP EXECUTE format('DROP POLICY %I ON public.proposal_activity',r.policyname); END LOOP;
END $$;
ALTER TABLE public.proposal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_activity_read ON public.proposal_activity FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.proposals p JOIN public.profiles pr ON pr.id=(SELECT auth.uid())
    WHERE p.id=proposal_activity.proposal_id AND pr.organization_id=p.organization_id AND pr.role <> 'portal_user'
      AND public.user_has_module_access(auth.uid(),'proposals'))
  OR (viewer_user_id=(SELECT auth.uid()) AND private.proposal_engagement_customer(proposal_id))
);
-- Existing download/decline workflows still insert their own action rows. New visits use the RPC only.
CREATE POLICY proposal_activity_actions ON public.proposal_activity FOR INSERT TO authenticated WITH CHECK (
  activity_type IN ('downloaded','shared','accepted','declined') AND visit_id IS NULL
  AND (private.proposal_engagement_customer(proposal_id) OR
    EXISTS(SELECT 1 FROM public.proposals p JOIN public.profiles pr ON pr.id=(SELECT auth.uid())
      WHERE p.id=proposal_activity.proposal_id AND pr.organization_id=p.organization_id AND pr.role <> 'portal_user'
      AND public.user_has_module_access(auth.uid(),'proposals')))
);
REVOKE ALL ON public.proposal_activity FROM anon;
REVOKE UPDATE,DELETE ON public.proposal_activity FROM authenticated;
GRANT SELECT,INSERT ON public.proposal_activity TO authenticated;

-- Legacy summary used SECURITY DEFINER and ignored row permissions.
CREATE OR REPLACE FUNCTION get_proposal_activity_summary(p_proposal_id uuid)
RETURNS TABLE (
  total_views bigint,
  total_time_seconds bigint,
  last_viewed_at timestamptz,
  unique_sessions bigint,
  unique_viewers bigint,
  unique_ips jsonb,
  device_breakdown jsonb,
  browser_breakdown jsonb,
  os_breakdown jsonb,
  activity_timeline jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH ip_counts AS (
    SELECT 
      ip_address,
      COUNT(*) as view_count,
      MAX(created_at) as last_seen,
      MAX(metadata->>'deviceType') as device_type,
      MAX(metadata->>'browser') as browser,
      MAX(metadata->>'os') as os
    FROM public.proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND ip_address IS NOT NULL
      AND ip_address != 'Unknown'
    GROUP BY ip_address
  ),
  device_stats AS (
    SELECT 
      metadata->>'deviceType' as device_type,
      COUNT(*) as count
    FROM public.proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'deviceType' IS NOT NULL
    GROUP BY metadata->>'deviceType'
  ),
  browser_stats AS (
    SELECT 
      metadata->>'browser' as browser,
      COUNT(*) as count
    FROM public.proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'browser' IS NOT NULL
    GROUP BY metadata->>'browser'
  ),
  os_stats AS (
    SELECT 
      metadata->>'os' as os,
      COUNT(*) as count
    FROM public.proposal_activity
    WHERE proposal_id = p_proposal_id 
      AND activity_type = 'viewed'
      AND metadata->>'os' IS NOT NULL
    GROUP BY metadata->>'os'
  )
  SELECT
    COUNT(*) FILTER (WHERE activity_type = 'viewed') as total_views,
    COALESCE(SUM(duration_seconds) FILTER (WHERE activity_type = 'viewed' AND metadata->'engagement'->>'trackingVersion' = '1'), 0) as total_time_seconds,
    MAX(created_at) FILTER (WHERE activity_type = 'viewed') as last_viewed_at,
    COUNT(*) FILTER (WHERE activity_type = 'viewed') as unique_sessions,
    (SELECT COUNT(*) FROM ip_counts) as unique_viewers,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'ip', ip_address,
          'views', view_count,
          'lastSeen', last_seen,
          'deviceType', device_type,
          'browser', browser,
          'os', os
        ) ORDER BY view_count DESC
      ) FROM ip_counts),
      '[]'::jsonb
    ) as unique_ips,
    COALESCE(
      (SELECT jsonb_object_agg(device_type, count) FROM device_stats),
      '{}'::jsonb
    ) as device_breakdown,
    COALESCE(
      (SELECT jsonb_object_agg(browser, count) FROM browser_stats),
      '{}'::jsonb
    ) as browser_breakdown,
    COALESCE(
      (SELECT jsonb_object_agg(os, count) FROM os_stats),
      '{}'::jsonb
    ) as os_breakdown,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', activity_type,
          'created_at', created_at,
          'duration', duration_seconds,
          'ip_address', ip_address,
          'deviceType', metadata->>'deviceType',
          'browser', metadata->>'browser',
          'os', metadata->>'os'
        ) ORDER BY created_at DESC
      ) FILTER (WHERE activity_type IN ('viewed', 'downloaded', 'accepted', 'declined')),
      '[]'::jsonb
    ) as activity_timeline
  FROM public.proposal_activity
  WHERE proposal_id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path='';

REVOKE ALL ON FUNCTION public.get_proposal_activity_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_activity_summary(uuid) TO authenticated;

CREATE FUNCTION private.start_proposal_engagement(p_proposal_id uuid,p_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; BEGIN
  IF p_visit_id IS NULL OR NOT private.proposal_engagement_customer(p_proposal_id) THEN RETURN NULL; END IF;
  INSERT INTO public.proposal_activity(proposal_id,activity_type,viewer_user_id,visit_id,metadata)
    VALUES(p_proposal_id,'viewed',auth.uid(),p_visit_id,
      '{"engagement":{"trackingVersion":1,"sections":{},"clicks":{}}}'::jsonb)
    ON CONFLICT(viewer_user_id,visit_id) WHERE visit_id IS NOT NULL DO NOTHING;
  SELECT id INTO v_id FROM public.proposal_activity
    WHERE viewer_user_id=auth.uid() AND visit_id=p_visit_id AND proposal_id=p_proposal_id;
  IF v_id IS NOT NULL THEN
    UPDATE public.proposals SET status='portal' WHERE id=p_proposal_id AND status='sent';
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION private.start_proposal_engagement(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.start_proposal_engagement(uuid,uuid) TO authenticated;
CREATE FUNCTION public.start_proposal_engagement(p_proposal_id uuid,p_visit_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.start_proposal_engagement(p_proposal_id,p_visit_id); $$;
REVOKE ALL ON FUNCTION public.start_proposal_engagement(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_proposal_engagement(uuid,uuid) TO authenticated;

CREATE FUNCTION private.report_proposal_engagement(p_activity_id uuid,p_seconds integer,p_sections jsonb,p_clicks jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.proposal_activity; v_key text; v_value jsonb; v_sections jsonb='{}';
  v_clicks jsonb='{}'; v_count integer; v_total integer=0; v_old integer;
BEGIN
  SELECT * INTO v_row FROM public.proposal_activity WHERE id=p_activity_id AND viewer_user_id=auth.uid()
    AND activity_type='viewed' AND visit_id IS NOT NULL FOR UPDATE;
  IF v_row.id IS NULL OR NOT private.proposal_engagement_customer(v_row.proposal_id) THEN RETURN false; END IF;
  IF p_seconds IS NULL OR p_seconds<0 OR p_seconds>86400
    OR p_seconds>ceil(extract(epoch FROM (clock_timestamp()-v_row.created_at)))+2
    OR jsonb_typeof(p_sections) IS DISTINCT FROM 'object' OR jsonb_typeof(p_clicks) IS DISTINCT FROM 'object'
    OR octet_length(p_sections::text)>20000 OR octet_length(p_clicks::text)>2000 THEN RETURN false; END IF;
  IF p_seconds<coalesce(v_row.duration_seconds,0) THEN RETURN true; END IF; -- late snapshot cannot regress time
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_sections) LOOP
    IF jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^\d{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer;
    IF v_count>p_seconds THEN RETURN false; END IF;
    IF v_key NOT IN ('scope','pricing','actions','notes','video') AND NOT EXISTS(
      SELECT 1 FROM public.proposal_rooms r WHERE r.proposal_id=v_row.proposal_id AND 'room:'||r.id::text=v_key
    ) THEN RETURN false; END IF;
    v_old=coalesce((v_row.metadata->'engagement'->'sections'->>v_key)::integer,0);
    v_count=greatest(v_count,v_old); v_total=v_total+v_count;
    v_sections=v_sections||jsonb_build_object(v_key,v_count);
  END LOOP;
  -- Cumulative snapshots include previously recorded sections; reject removal/regression.
  FOR v_key,v_value IN SELECT * FROM jsonb_each(coalesce(v_row.metadata->'engagement'->'sections','{}')) LOOP
    IF NOT v_sections ? v_key THEN v_sections=v_sections||jsonb_build_object(v_key,v_value); v_total=v_total+v_value::text::integer; END IF;
  END LOOP;
  IF v_total>p_seconds THEN RETURN false; END IF;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_clicks) LOOP
    IF v_key NOT IN ('download_clicked','approval_clicked','payment_clicked','question_clicked','change_request_clicked','decline_clicked','video_opened','video_played')
      OR jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^\d{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer; IF v_count>10000 THEN RETURN false; END IF;
    v_clicks=v_clicks||jsonb_build_object(v_key,greatest(v_count,coalesce((v_row.metadata->'engagement'->'clicks'->>v_key)::integer,0)));
  END LOOP;
  v_clicks=coalesce(v_row.metadata->'engagement'->'clicks','{}')||v_clicks;
  UPDATE public.proposal_activity SET duration_seconds=p_seconds,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('engagement',jsonb_build_object('trackingVersion',1,'sections',v_sections,'clicks',v_clicks))
    WHERE id=v_row.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.report_proposal_engagement(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.report_proposal_engagement(uuid,integer,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.report_proposal_engagement(p_activity_id uuid,p_seconds integer,p_sections jsonb,p_clicks jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.report_proposal_engagement(p_activity_id,p_seconds,p_sections,p_clicks); $$;
REVOKE ALL ON FUNCTION public.report_proposal_engagement(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_proposal_engagement(uuid,integer,jsonb,jsonb) TO authenticated;

-- Old globally mounted timer must not mutate another customer's/new visit's duration.
REVOKE ALL ON FUNCTION public.update_proposal_activity_duration(uuid,integer) FROM PUBLIC,anon,authenticated;
COMMENT ON COLUMN public.proposal_activity.viewer_user_id IS 'Verified auth identity for engagement visits; legacy events remain unidentified.';
COMMENT ON COLUMN public.proposal_activity.visit_id IS 'Random ID for one mounted customer visit, isolated per tab; retries are idempotent.';
