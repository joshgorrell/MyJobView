-- Reuse the established server-only worker credential and project endpoint in Vault.
-- The job polls for due reports; each dealer gets one email Monday at 08:00 local time.
CREATE FUNCTION private.invoke_proposal_activity_weekly() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; credential text; BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='security_billing_project_url';
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='security_billing_worker_secret';
 IF endpoint IS NULL OR endpoint !~ '^https://[a-z0-9]+\.supabase\.co$' OR credential IS NULL THEN RETURN NULL; END IF;
 RETURN net.http_post(url:=endpoint||'/functions/v1/proposal-activity-weekly',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION private.invoke_proposal_activity_weekly() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('proposal-activity-weekly-due-reports','*/15 * * * *','select private.invoke_proposal_activity_weekly();');
