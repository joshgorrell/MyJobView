-- Extend the existing verified-customer engagement heartbeat for Our Promise reconsideration.
-- Keep all authorization, ownership, time bounds, and cumulative snapshot checks intact.
CREATE OR REPLACE FUNCTION private.report_proposal_engagement(p_activity_id uuid,p_seconds integer,p_sections jsonb,p_clicks jsonb)
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
  IF p_seconds<coalesce(v_row.duration_seconds,0) THEN RETURN true; END IF;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_sections) LOOP
    IF jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^[0-9]{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer;
    IF v_count>p_seconds THEN RETURN false; END IF;
    IF v_key NOT IN ('scope','pricing','actions','notes','video','promise') AND NOT EXISTS(
      SELECT 1 FROM public.proposal_rooms r WHERE r.proposal_id=v_row.proposal_id AND 'room:'||r.id::text=v_key
    ) THEN RETURN false; END IF;
    v_old=coalesce((v_row.metadata->'engagement'->'sections'->>v_key)::integer,0);
    v_count=greatest(v_count,v_old); v_total=v_total+v_count;
    v_sections=v_sections||jsonb_build_object(v_key,v_count);
  END LOOP;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(coalesce(v_row.metadata->'engagement'->'sections','{}')) LOOP
    IF NOT v_sections ? v_key THEN v_sections=v_sections||jsonb_build_object(v_key,v_value); v_total=v_total+v_value::text::integer; END IF;
  END LOOP;
  IF v_total>p_seconds THEN RETURN false; END IF;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_clicks) LOOP
    IF v_key NOT IN ('download_clicked','approval_clicked','payment_clicked','question_clicked','change_request_clicked','decline_clicked','decline_to_changes_clicked','decline_to_approval_clicked','decline_rep_call_clicked','decline_rep_email_clicked','decline_continue_clicked','video_opened','video_played')
      OR jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^[0-9]{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer; IF v_count>10000 THEN RETURN false; END IF;
    v_clicks=v_clicks||jsonb_build_object(v_key,greatest(v_count,coalesce((v_row.metadata->'engagement'->'clicks'->>v_key)::integer,0)));
  END LOOP;
  v_clicks=coalesce(v_row.metadata->'engagement'->'clicks','{}')||v_clicks;
  UPDATE public.proposal_activity SET duration_seconds=p_seconds,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('engagement',jsonb_build_object('trackingVersion',1,'sections',v_sections,'clicks',v_clicks))
    WHERE id=v_row.id;
  RETURN true;
END $$;
