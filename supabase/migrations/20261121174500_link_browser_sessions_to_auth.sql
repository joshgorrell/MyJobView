-- Bind browser activity sessions to the verified Supabase Auth session JWT claim.
-- Browser IDs alone must not merge distinct authenticated logins.
CREATE OR REPLACE FUNCTION public.start_browser_session(
 p_browser_id uuid, p_device_type text, p_browser_name text,
 p_browser_version text, p_os_name text, p_os_version text,
 p_device_model text, p_device_vendor text, p_user_agent text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_org uuid;
 v_auth_session uuid;
 v_signature text;
 v_id uuid;
BEGIN
 IF v_user IS NULL OR p_browser_id IS NULL THEN
   RAISE EXCEPTION 'Authentication and browser identity required';
 END IF;
 SELECT organization_id INTO v_org FROM public.profiles WHERE id=v_user;
 IF v_org IS NULL THEN RAISE EXCEPTION 'Profile required'; END IF;
 -- session_id is taken from the server-verified JWT, never from client input.
 v_auth_session := NULLIF(auth.jwt()->>'session_id','')::uuid;
 v_signature := v_org::text || ':' || v_user::text || ':' || p_browser_id::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_signature,0));
 SELECT id INTO v_id FROM public.user_sessions
 WHERE user_id=v_user AND organization_id=v_org
   AND device_signature=v_signature AND is_active
   AND last_activity > now()-interval '30 minutes'
   AND auth_session_id IS NOT DISTINCT FROM v_auth_session
 ORDER BY last_activity DESC LIMIT 1;
 IF v_id IS NOT NULL THEN
   UPDATE public.user_sessions SET last_activity=now() WHERE id=v_id;
   RETURN v_id;
 END IF;
 INSERT INTO public.user_sessions(
   user_id,organization_id,device_signature,auth_session_id,user_agent,
   device_type,browser_name,browser_version,os_name,os_version,device_model,device_vendor
 ) VALUES(
   v_user,v_org,v_signature,v_auth_session,p_user_agent,
   p_device_type,p_browser_name,p_browser_version,p_os_name,p_os_version,p_device_model,p_device_vendor
 ) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.start_browser_session(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_browser_session(uuid,text,text,text,text,text,text,text,text) TO authenticated;
