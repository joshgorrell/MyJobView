-- Dedicated worker credential stays in Vault. Neither browser roles nor cron.job contain it.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='security_billing_worker_secret') THEN
  PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'security_billing_worker_secret','Dedicated security recurring billing worker credential');
 END IF;
END $$;
CREATE FUNCTION private.security_billing_worker_authorized(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT length(p_secret) BETWEEN 32 AND 256 AND EXISTS(
  SELECT 1 FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret'
   AND extensions.digest(p_secret,'sha256')=extensions.digest(decrypted_secret,'sha256'));
$$;
REVOKE ALL ON FUNCTION private.security_billing_worker_authorized(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.security_billing_worker_authorized(text) TO service_role;
CREATE FUNCTION public.security_billing_worker_authorized(p_secret text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.security_billing_worker_authorized(p_secret); $$;
REVOKE ALL ON FUNCTION public.security_billing_worker_authorized(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_billing_worker_authorized(text) TO service_role;

-- Only the database owner/scheduler may dispatch this call. No customer/staff API.
CREATE FUNCTION private.invoke_security_billing_worker()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; credential text; BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='security_billing_project_url';
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret';
 IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+\.supabase\.co$' OR credential IS NULL THEN RAISE EXCEPTION 'Configure the security billing worker endpoint and credential'; END IF;
 RETURN net.http_post(url:=endpoint||'/functions/v1/security-recurring-billing',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
  body:='{}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION private.invoke_security_billing_worker() FROM PUBLIC,anon,authenticated,service_role;
-- Project URL is provisioned separately for each deployment; no hardcoded project ID in migrations.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='security_billing_project_url') THEN
  PERFORM cron.schedule('security-recurring-billing-every-15-minutes','*/15 * * * *','select private.invoke_security_billing_worker();');
 END IF;
END $$;

CREATE FUNCTION private.security_activation_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='active' AND OLD.status IS DISTINCT FROM 'active' AND NEW.onboarding_agreement_snapshot IS NOT NULL
   AND coalesce(NEW.agreement_type,'monitoring')='monitoring' AND NEW.security_billing_mode='autopay' THEN
  IF NOT EXISTS(SELECT 1 FROM public.quickbooks_settings q WHERE q.organization_id=NEW.organization_id
    AND q.is_connected AND q.payments_enabled AND nullif(btrim(q.security_monitoring_item_id),'') IS NOT NULL) THEN
   RAISE EXCEPTION 'Connect QuickBooks with Payments permission and configure the monitoring sales item before AutoPay activation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.company_settings s WHERE s.organization_id=NEW.organization_id AND nullif(btrim(s.from_email),'') IS NOT NULL AND nullif(btrim(s.company_email),'') IS NOT NULL) THEN
   RAISE EXCEPTION 'Configure the billing email sender before AutoPay activation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='security-recurring-billing-every-15-minutes' AND active)
    OR NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='security_billing_project_url') THEN
   RAISE EXCEPTION 'Configure the recurring billing scheduler before AutoPay activation';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.security_activation_readiness() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER security_activation_readiness BEFORE UPDATE ON public.security_contracts FOR EACH ROW EXECUTE FUNCTION private.security_activation_readiness();
