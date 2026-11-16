-- Bind existing browser tracking to the verified top-level Auth session claim. Historical
-- rows stay unbound until their next authenticated heartbeat; no editable metadata is used.
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS auth_session_id uuid;
CREATE INDEX IF NOT EXISTS user_sessions_auth_session_active ON public.user_sessions(auth_session_id,user_id,organization_id) WHERE is_active;
CREATE FUNCTION assist_private.bind_browser_auth_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sid uuid;
BEGIN
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() OR NOT NEW.is_active THEN RETURN NEW; END IF;
 BEGIN sid:=nullif(auth.jwt()->>'session_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NEW; END;
 IF sid IS NOT NULL AND EXISTS(SELECT 1 FROM auth.sessions s JOIN public.profiles p ON p.id=s.user_id
  WHERE s.id=sid AND s.user_id=NEW.user_id AND p.organization_id=NEW.organization_id) THEN NEW.auth_session_id:=sid; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION assist_private.bind_browser_auth_session() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assist_bind_browser_auth_session BEFORE INSERT OR UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION assist_private.bind_browser_auth_session();

CREATE TABLE assist_private.engineer_access (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(organization_id,user_id)
);
ALTER TABLE assist_private.engineer_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.engineer_access FROM PUBLIC,anon,authenticated;
GRANT ALL ON assist_private.engineer_access TO service_role;
CREATE TABLE assist_private.support_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 auth_session_id uuid NOT NULL,
 generation bigint NOT NULL,
 device_id text NOT NULL,
 native_username text NOT NULL,
 state text NOT NULL CHECK(state IN ('starting','active','ended','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 hard_expires_at timestamptz NOT NULL DEFAULT now()+interval '4 hours',
 ended_at timestamptz,
 end_reason text
);
CREATE INDEX assist_sessions_org_time ON assist_private.support_sessions(organization_id,created_at DESC);
ALTER TABLE assist_private.support_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.support_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON assist_private.support_sessions TO service_role;

CREATE FUNCTION assist_private.operator_eligible(p_org uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 WHERE p.id=p_actor AND p.organization_id=p_org AND p.is_active AND p.role<>'portal_user' AND o.is_active
 AND (p.role='admin' OR EXISTS(SELECT 1 FROM assist_private.engineer_access g WHERE g.organization_id=p_org AND g.user_id=p_actor)));
$$;
REVOKE ALL ON FUNCTION assist_private.operator_eligible(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION assist_private.operator_live(p_org uuid,p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT assist_private.operator_eligible(p_org,p_actor)
 AND EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor)
 AND EXISTS(SELECT 1 FROM public.user_sessions WHERE auth_session_id=p_session AND user_id=p_actor AND organization_id=p_org AND is_active)
 AND EXISTS(SELECT 1 FROM assist_private.dealer_preferences p JOIN assist_private.dealer_setup s USING(organization_id)
 JOIN assist_private.activation_jobs j USING(organization_id)
 WHERE p.organization_id=p_org AND p.enabled AND s.enrollment_enabled AND s.verified_at IS NOT NULL AND j.state='ready' AND j.desired_enabled);
$$;
REVOKE ALL ON FUNCTION assist_private.operator_live(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION assist_private.operator_access(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_org);
BEGIN RETURN assist_private.setup_status(org)||jsonb_build_object('can_operate',assist_private.operator_eligible(org,auth.uid())); END $$;
REVOKE ALL ON FUNCTION assist_private.operator_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assist_private.operator_access(uuid) TO authenticated;
CREATE FUNCTION public.get_assist_access(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT assist_private.operator_access(p_organization_id);$$;
REVOKE ALL ON FUNCTION public.get_assist_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_assist_access(uuid) TO authenticated;

CREATE FUNCTION assist_private.manage_operators(p_org uuid,p_target uuid DEFAULT NULL,p_granted boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_org);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Dealer administrator required' USING ERRCODE='42501'; END IF;
 IF p_target IS NOT NULL THEN
  IF p_granted IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target AND organization_id=org AND is_active AND role<>'portal_user') THEN RAISE EXCEPTION 'Invalid employee' USING ERRCODE='42501'; END IF;
  IF p_granted THEN INSERT INTO assist_private.engineer_access VALUES(org,p_target) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM assist_private.engineer_access WHERE organization_id=org AND user_id=p_target; END IF;
 END IF;
 RETURN jsonb_build_object('people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.full_name,p.email,'Employee'),'admin',p.role='admin',
 'granted',p.role='admin' OR EXISTS(SELECT 1 FROM assist_private.engineer_access WHERE organization_id=org AND user_id=p.id)) ORDER BY p.full_name)
 FROM public.profiles p WHERE p.organization_id=org AND p.is_active AND p.role<>'portal_user'),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION assist_private.manage_operators(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assist_private.manage_operators(uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.manage_assist_operators(p_organization_id uuid,p_user_id uuid DEFAULT NULL,p_granted boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT assist_private.manage_operators(p_organization_id,p_user_id,p_granted);$$;
REVOKE ALL ON FUNCTION public.manage_assist_operators(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_assist_operators(uuid,uuid,boolean) TO authenticated;

-- Service-only broker API. Browser actor/session IDs are never accepted without verified JWT resolution.
CREATE FUNCTION assist_private.support_service(p_action text,p_org uuid,p_actor uuid,p_auth_session uuid,p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r assist_private.support_sessions; allowed boolean; gen bigint; dom text; exp timestamptz; sid uuid;
BEGIN
 IF p_action='access' THEN RETURN jsonb_build_object('allowed',assist_private.operator_live(p_org,p_actor,p_auth_session)); END IF;
 IF p_action='open' THEN
  IF NOT assist_private.operator_live(p_org,p_actor,p_auth_session) THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_actor FOR UPDATE;
  IF (SELECT count(*) FROM assist_private.support_sessions WHERE organization_id=p_org AND actor_id=p_actor AND state IN ('starting','active') AND expires_at>now())>=5 THEN RAISE EXCEPTION 'Session limit reached'; END IF;
  SELECT j.generation,s.mesh_domain INTO gen,dom FROM assist_private.activation_jobs j JOIN assist_private.dealer_setup s USING(organization_id) WHERE j.organization_id=p_org;
  IF NOT starts_with(coalesce(p_params->>'device_id',''),'node/'||dom||'/') OR length(p_params->>'device_id')>256 THEN RAISE EXCEPTION 'Invalid device'; END IF;
  exp:=to_timestamp((p_params->>'token_exp')::double precision);
  IF exp IS NULL OR exp<=now() THEN RAISE EXCEPTION 'Expired login'; END IF;
  sid:=gen_random_uuid();
  INSERT INTO assist_private.support_sessions(id,organization_id,actor_id,auth_session_id,generation,device_id,native_username,state,expires_at)
  VALUES(sid,p_org,p_actor,p_auth_session,gen,p_params->>'device_id','mjv-session-'||replace(sid::text,'-',''),'starting',now()+interval '3 minutes') RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM assist_private.support_sessions WHERE id=(p_params->>'session_id')::uuid AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_actor IS NOT NULL AND (p_actor IS DISTINCT FROM r.actor_id OR p_auth_session IS DISTINCT FROM r.auth_session_id) THEN RAISE EXCEPTION 'Session owner required' USING ERRCODE='42501'; END IF;
  allowed:=r.state IN ('starting','active') AND r.expires_at>now() AND r.hard_expires_at>now()
    AND assist_private.operator_live(r.organization_id,r.actor_id,r.auth_session_id)
    AND EXISTS(SELECT 1 FROM assist_private.activation_jobs WHERE organization_id=p_org AND generation=r.generation AND state='ready');
  IF p_action IN ('activate','touch') THEN
   IF NOT allowed OR p_actor IS NULL THEN RETURN jsonb_build_object('valid',false); END IF;
   exp:=to_timestamp((p_params->>'token_exp')::double precision);
   IF exp IS NULL OR exp<=now() THEN RETURN jsonb_build_object('valid',false); END IF;
   UPDATE assist_private.support_sessions SET state='active',expires_at=least(now()+interval '3 minutes',hard_expires_at) WHERE id=r.id RETURNING * INTO r;
  ELSIF p_action='end' THEN
   IF p_params->>'reason' IS NULL OR p_params->>'reason' NOT IN ('user_ended','expired','access_revoked','runtime_unavailable','launch_failed') THEN RAISE EXCEPTION 'Invalid end reason'; END IF;
   UPDATE assist_private.support_sessions SET state=CASE WHEN p_params->>'reason'='launch_failed' THEN 'failed' ELSE 'ended' END,
    ended_at=coalesce(ended_at,now()),end_reason=coalesce(end_reason,p_params->>'reason') WHERE id=r.id RETURNING * INTO r;
   allowed:=false;
  ELSIF p_action<>'check' THEN RAISE EXCEPTION 'Invalid broker action'; END IF;
 END IF;
 RETURN jsonb_build_object('valid',coalesce(allowed,true),'id',r.id,'generation',r.generation,'native_username',r.native_username,'device_id',r.device_id,'expires_at',r.expires_at);
END $$;
REVOKE ALL ON FUNCTION assist_private.support_service(text,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assist_private.support_service(text,uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.assist_support_service(p_action text,p_organization_id uuid,p_actor_id uuid,p_auth_session_id uuid,p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT assist_private.support_service(p_action,p_organization_id,p_actor_id,p_auth_session_id,p_params);$$;
REVOKE ALL ON FUNCTION public.assist_support_service(text,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assist_support_service(text,uuid,uuid,uuid,jsonb) TO service_role;
