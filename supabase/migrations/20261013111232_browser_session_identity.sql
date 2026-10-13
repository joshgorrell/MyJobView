-- Browser installations have a stable ID. Legacy browser/OS groups remain
-- historical groups; they cannot reliably identify physical devices.
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS device_signature text;
CREATE INDEX IF NOT EXISTS user_sessions_device_signature_idx ON public.user_sessions(organization_id, device_signature);

CREATE OR REPLACE FUNCTION public.start_browser_session(p_browser_id uuid, p_device_type text, p_browser_name text, p_browser_version text, p_os_name text, p_os_version text, p_device_model text, p_device_vendor text, p_user_agent text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_org uuid; v_signature text; v_id uuid;
BEGIN
  IF v_user IS NULL OR p_browser_id IS NULL THEN RAISE EXCEPTION 'Authentication and browser identity required'; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE id=v_user;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Profile required'; END IF;
  v_signature := v_org::text || ':' || v_user::text || ':' || p_browser_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_signature,0));
  SELECT id INTO v_id FROM public.user_sessions WHERE user_id=v_user AND organization_id=v_org
    AND device_signature=v_signature AND is_active AND last_activity > now()-interval '30 minutes'
    ORDER BY last_activity DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.user_sessions SET last_activity=now() WHERE id=v_id;
    RETURN v_id;
  END IF;
  INSERT INTO public.user_sessions(user_id,organization_id,device_signature,user_agent,device_type,browser_name,browser_version,os_name,os_version,device_model,device_vendor)
  VALUES(v_user,v_org,v_signature,p_user_agent,p_device_type,p_browser_name,p_browser_version,p_os_name,p_os_version,p_device_model,p_device_vendor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.start_browser_session(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_browser_session(uuid,text,text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_device_nickname_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_signature text;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  v_signature := COALESCE(NEW.device_signature, public.generate_device_signature(NEW.device_type, NEW.browser_name, NEW.os_name));
  INSERT INTO public.device_nicknames(device_signature,device_type,browser_name,os_name,nickname,last_seen,session_count,total_time_seconds,organization_id)
  VALUES(v_signature,NEW.device_type,NEW.browser_name,NEW.os_name,v_signature,NEW.last_activity,1,COALESCE(NEW.duration_seconds,0),NEW.organization_id)
  ON CONFLICT(device_signature) DO UPDATE SET last_seen=GREATEST(device_nicknames.last_seen,EXCLUDED.last_seen),
    session_count=device_nicknames.session_count+1,total_time_seconds=device_nicknames.total_time_seconds+EXCLUDED.total_time_seconds,updated_at=now()
    WHERE device_nicknames.organization_id=EXCLUDED.organization_id;
  RETURN NEW;
END $$;
-- Internal trigger only, never a client endpoint.
REVOKE ALL ON FUNCTION public.update_device_nickname_stats() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
