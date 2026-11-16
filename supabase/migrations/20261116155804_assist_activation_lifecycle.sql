-- Durable, generation-fenced activation. Provider operations run outside database transactions.
CREATE TABLE assist_private.activation_jobs (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 generation bigint NOT NULL DEFAULT 1,
 desired_enabled boolean NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','working','ready','off','retry','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 error_code text CHECK(error_code IN ('provider_unavailable','verification_failed','not_configured','provider_rejected')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assist_private.activation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.activation_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON assist_private.activation_jobs TO service_role;
CREATE INDEX assist_activation_due ON assist_private.activation_jobs(next_attempt_at) WHERE state IN ('pending','retry','working');

CREATE FUNCTION assist_private.queue_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN RETURN NEW; END IF;
 INSERT INTO assist_private.activation_jobs(organization_id,desired_enabled,state)
 VALUES(NEW.organization_id,NEW.enabled,'pending')
 ON CONFLICT(organization_id) DO UPDATE SET generation=assist_private.activation_jobs.generation+1,
 desired_enabled=EXCLUDED.desired_enabled,state='pending',attempts=0,next_attempt_at=now(),lease_token=NULL,
 lease_until=NULL,error_code=NULL,updated_at=now();
 -- Both enable and disable invalidate the old verified installation until reconciled.
 UPDATE assist_private.dealer_setup SET enrollment_enabled=false WHERE organization_id=NEW.organization_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION assist_private.queue_activation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assist_preference_lifecycle AFTER INSERT OR UPDATE OF enabled ON assist_private.dealer_preferences
 FOR EACH ROW EXECUTE FUNCTION assist_private.queue_activation();
INSERT INTO assist_private.activation_jobs(organization_id,desired_enabled,state)
 SELECT organization_id,enabled,'pending' FROM assist_private.dealer_preferences;
UPDATE assist_private.dealer_setup SET enrollment_enabled=false;

CREATE OR REPLACE FUNCTION assist_private.setup_status(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_organization_id); result jsonb; enabled boolean;
BEGIN
 SELECT coalesce(p.enabled,false) INTO enabled FROM assist_private.dealer_preferences p WHERE organization_id=org;
 enabled:=coalesce(enabled,false);
 SELECT jsonb_build_object('enabled',enabled,
 'provisioned',EXISTS(SELECT 1 FROM assist_private.dealer_setup WHERE organization_id=org AND verified_at IS NOT NULL),
 'windows_download_ready',enabled AND EXISTS(SELECT 1 FROM assist_private.dealer_setup WHERE organization_id=org AND enrollment_enabled AND verified_at IS NOT NULL),
 'activation_state',CASE WHEN j.state='ready' AND enabled THEN 'enrollment_ready'
   WHEN j.state='off' AND NOT enabled THEN 'off'
   WHEN j.state='failed' THEN 'needs_attention'
   WHEN enabled THEN 'activation_pending' ELSE 'deactivation_pending' END,
 'last_checked_at',j.updated_at)
 INTO result FROM assist_private.activation_jobs j WHERE organization_id=org;
 RETURN coalesce(result,jsonb_build_object('enabled',false,'provisioned',false,'windows_download_ready',false,'activation_state','off'));
END $$;

CREATE FUNCTION assist_private.claim_activation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job assist_private.activation_jobs;
BEGIN
 UPDATE assist_private.activation_jobs SET state='failed',lease_token=NULL,lease_until=NULL,error_code='provider_unavailable',updated_at=now()
 WHERE state='working' AND attempts>=8 AND lease_until<=now();
 SELECT * INTO job FROM assist_private.activation_jobs
 WHERE ((state IN ('pending','retry') AND next_attempt_at<=now()) OR (state='working' AND lease_until<now()))
 AND attempts<8 ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE assist_private.activation_jobs SET state='working',attempts=attempts+1,lease_token=gen_random_uuid(),
 lease_until=now()+interval '2 minutes',updated_at=now() WHERE organization_id=job.organization_id RETURNING * INTO job;
 RETURN jsonb_build_object('organization_id',job.organization_id,'generation',job.generation,'desired_enabled',job.desired_enabled,
 'lease_token',job.lease_token,'lease_until',job.lease_until,'attempt',job.attempts);
END $$;
REVOKE ALL ON FUNCTION assist_private.claim_activation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assist_private.claim_activation() TO service_role;
CREATE FUNCTION public.claim_assist_activation()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT assist_private.claim_activation();$$;
REVOKE ALL ON FUNCTION public.claim_assist_activation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_assist_activation() TO service_role;

CREATE FUNCTION assist_private.finish_activation(p_org uuid,p_generation bigint,p_lease uuid,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job assist_private.activation_jobs; desired boolean; code text;
BEGIN
 SELECT * INTO job FROM assist_private.activation_jobs WHERE organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR job.generation<>p_generation OR job.lease_token IS DISTINCT FROM p_lease
 OR job.state<>'working' OR job.lease_until<=now() THEN RETURN false; END IF;
 SELECT enabled INTO desired FROM assist_private.dealer_preferences WHERE organization_id=p_org;
 IF desired IS DISTINCT FROM job.desired_enabled THEN RETURN false; END IF;
 IF p_result->>'status'='applied' AND p_result->>'verified'='true' THEN
  IF desired THEN
   IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org AND is_active) THEN RETURN false; END IF;
   -- The native URL constraint verifies origin/domain/architecture. Provider verification must also
   -- prove actual remote ownership, enforced consent, and the isolation canary before reporting success.
   INSERT INTO assist_private.dealer_setup(organization_id,server_origin,mesh_domain,windows_download_url,enrollment_enabled,verified_at)
   VALUES(p_org,p_result->>'server_origin',p_result->>'mesh_domain',p_result->>'windows_download_url',true,now())
   ON CONFLICT(organization_id) DO UPDATE SET server_origin=EXCLUDED.server_origin,mesh_domain=EXCLUDED.mesh_domain,
    windows_download_url=EXCLUDED.windows_download_url,enrollment_enabled=true,verified_at=now();
  ELSE
   UPDATE assist_private.dealer_setup SET enrollment_enabled=false,verified_at=NULL WHERE organization_id=p_org;
  END IF;
  UPDATE assist_private.activation_jobs SET state=CASE WHEN desired THEN 'ready' ELSE 'off' END,
    lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE organization_id=p_org;
 ELSE
  code:=p_result->>'error_code';
  IF code IS NULL OR code NOT IN ('provider_unavailable','verification_failed','not_configured','provider_rejected') THEN code:='provider_rejected'; END IF;
  UPDATE assist_private.dealer_setup SET enrollment_enabled=false WHERE organization_id=p_org;
  UPDATE assist_private.activation_jobs SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'retry' END,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^(attempts-1))::integer)),
   lease_token=NULL,lease_until=NULL,error_code=code,updated_at=now() WHERE organization_id=p_org;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION assist_private.finish_activation(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assist_private.finish_activation(uuid,bigint,uuid,jsonb) TO service_role;
CREATE FUNCTION public.finish_assist_activation(p_organization_id uuid,p_generation bigint,p_lease_token uuid,p_result jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT assist_private.finish_activation(p_organization_id,p_generation,p_lease_token,p_result);
$$;
REVOKE ALL ON FUNCTION public.finish_assist_activation(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_assist_activation(uuid,bigint,uuid,jsonb) TO service_role;

-- Admin Retry is explicit and preserves the desired state; stale workers lose their lease.
CREATE FUNCTION assist_private.retry_activation(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_org);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Dealer administrator required' USING ERRCODE='42501'; END IF;
 UPDATE assist_private.activation_jobs SET generation=generation+1,state='pending',attempts=0,next_attempt_at=now(),
 lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE organization_id=org AND state='failed';
 RETURN assist_private.setup_status(org);
END $$;
REVOKE ALL ON FUNCTION assist_private.retry_activation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assist_private.retry_activation(uuid) TO authenticated;
CREATE FUNCTION public.retry_assist_activation(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT assist_private.retry_activation(p_organization_id); $$;
REVOKE ALL ON FUNCTION public.retry_assist_activation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_assist_activation(uuid) TO authenticated;

-- Deactivation is required when an organization loses access, even without a UI toggle.
CREATE FUNCTION assist_private.organization_disabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.is_active AND NOT NEW.is_active THEN
  UPDATE assist_private.dealer_preferences SET enabled=false,updated_at=now() WHERE organization_id=NEW.id AND enabled;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION assist_private.organization_disabled() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assist_organization_disabled AFTER UPDATE OF is_active ON public.organizations
 FOR EACH ROW EXECUTE FUNCTION assist_private.organization_disabled();
-- Do not erase the only mapping for remote devices/accounts before confirmed deprovisioning.
CREATE FUNCTION assist_private.guard_organization_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assist_private.activation_jobs WHERE organization_id=OLD.id AND state<>'off')
 OR EXISTS(SELECT 1 FROM assist_private.dealer_setup WHERE organization_id=OLD.id AND verified_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Disable remote support and confirm provider deprovisioning before deleting this dealer' USING ERRCODE='55000';
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION assist_private.guard_organization_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assist_organization_delete BEFORE DELETE ON public.organizations
 FOR EACH ROW EXECUTE FUNCTION assist_private.guard_organization_delete();

CREATE FUNCTION assist_private.validate_activation_lease(p_org uuid,p_generation bigint,p_lease uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM assist_private.activation_jobs j
 JOIN assist_private.dealer_preferences p ON p.organization_id=j.organization_id
 JOIN public.organizations o ON o.id=j.organization_id
 WHERE j.organization_id=p_org AND j.generation=p_generation AND j.lease_token=p_lease
 AND j.state='working' AND j.lease_until>now() AND p.enabled=j.desired_enabled
 AND (NOT j.desired_enabled OR o.is_active));
$$;
REVOKE ALL ON FUNCTION assist_private.validate_activation_lease(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assist_private.validate_activation_lease(uuid,bigint,uuid) TO service_role;
CREATE FUNCTION public.validate_assist_activation_lease(p_organization_id uuid,p_generation bigint,p_lease_token uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT assist_private.validate_activation_lease(p_organization_id,p_generation,p_lease_token);
$$;
REVOKE ALL ON FUNCTION public.validate_assist_activation_lease(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_assist_activation_lease(uuid,bigint,uuid) TO service_role;
