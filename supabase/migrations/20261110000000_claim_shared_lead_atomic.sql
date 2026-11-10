-- Draft migration for #558. Requires PostgreSQL/RLS review before merge.
-- Claims are serialized by row lock; audit event and notifications commit with ownership.
CREATE OR REPLACE FUNCTION public.claim_shared_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_lead public.leads%ROWTYPE;
  v_actor_name text;
  v_notify_creator boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  SELECT organization_id, full_name INTO v_org, v_actor_name
  FROM public.profiles
  WHERE id=v_actor AND is_active IS TRUE AND is_sales_rep IS TRUE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Active sales representative required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id=p_lead_id AND organization_id=v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found or not accessible' USING ERRCODE='42501';
  END IF;

  IF v_lead.office_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_offices WHERE user_id=v_actor)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_offices
       WHERE user_id=v_actor AND office_id=v_lead.office_id
     ) THEN
    RAISE EXCEPTION 'Lead office not accessible' USING ERRCODE='42501';
  END IF;

  IF v_lead.status <> 'unclaimed'
     OR v_lead.is_fishbowl IS DISTINCT FROM TRUE
     OR v_lead.assigned_to IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.leads
  SET assigned_to=v_actor, status='claimed', is_fishbowl=FALSE, claimed_at=clock_timestamp()
  WHERE id=p_lead_id;

  INSERT INTO public.feed_events(event_type,lead_id,user_id,metadata,organization_id)
  VALUES ('lead_claimed',p_lead_id,v_actor,
    jsonb_build_object('claim_method','sales_department','original_source',v_lead.lead_source,
      'previous_assignee',v_lead.assigned_to,'new_assignee',v_actor),v_org);

  INSERT INTO public.notifications(user_id,type,lead_id,title,body,organization_id)
  VALUES (v_actor,'lead_claimed',p_lead_id,'Lead Claimed','You claimed ' || v_lead.contact_name,v_org);

  IF v_lead.created_by IS NOT NULL AND v_lead.created_by <> v_actor
     AND v_lead.priority IN ('high','urgent') THEN
    SELECT notify_on_lead_status INTO v_notify_creator
    FROM public.profiles
    WHERE id=v_lead.created_by AND organization_id=v_org;
    IF v_notify_creator IS DISTINCT FROM FALSE THEN
      INSERT INTO public.notifications(user_id,type,lead_id,title,body)
      VALUES (v_lead.created_by,'lead_status_update',p_lead_id,
        CASE WHEN v_lead.priority='urgent' THEN 'Urgent' ELSE 'High' END || ' Priority Lead Claimed',
        coalesce(v_actor_name,'Sales representative') || ' claimed your ' || v_lead.priority || ' priority lead: ' || v_lead.contact_name,v_org);
    END IF;
  END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_shared_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_shared_lead(uuid) TO authenticated;
