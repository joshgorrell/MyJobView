CREATE SCHEMA IF NOT EXISTS private;
-- Safe Day-7 processing: dates stay tied to substantial completion and failed sends remain retryable.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS test_tune_invite_sent_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS test_tune_invite_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.portal_access_tokens ADD COLUMN IF NOT EXISTS delivery_key text;
CREATE UNIQUE INDEX IF NOT EXISTS portal_token_delivery_key ON public.portal_access_tokens(contact_id,delivery_key) WHERE delivery_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.prepare_due_test_tune_invites()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.projects; g public.punchlist_access_grants; result jsonb:='[]'; c public.contacts; v_end date; v_created boolean;
BEGIN
 FOR p IN SELECT * FROM public.projects WHERE substantial_completion_date<=CURRENT_DATE-7
 AND substantial_completion_date+90>=CURRENT_DATE AND test_tune_invite_sent_at IS NULL
 AND (test_tune_started_at IS NULL OR test_tune_invite_managed)
 ORDER BY substantial_completion_date,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
  IF c.id IS NULL OR nullif(btrim(c.email),'') IS NULL THEN CONTINUE; END IF;
  v_end=p.substantial_completion_date+90;
  SELECT * INTO g FROM public.punchlist_access_grants WHERE project_id=p.id AND organization_id=p.organization_id AND contact_id=p.contact_id AND access_type='test_and_tune' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  v_created=g.id IS NULL;
  IF v_created THEN
   INSERT INTO public.punchlist_access_grants(organization_id,contact_id,project_id,sales_order_id,access_type,status,granted_date,expiration_date,notes)
   VALUES(p.organization_id,p.contact_id,p.id,p.sales_order_id,'test_and_tune','active',p.substantial_completion_date,v_end,'Automatic Day-7 Test & Tune enrollment') RETURNING * INTO g;
  END IF;
  IF g.status<>'active' OR (g.expiration_date IS NOT NULL AND g.expiration_date<CURRENT_DATE) THEN CONTINUE; END IF;
  UPDATE public.projects SET test_tune_started_at=coalesce(test_tune_started_at,now()),test_tune_invite_managed=test_tune_invite_managed OR v_created WHERE id=p.id;
  IF p.sales_order_id IS NOT NULL THEN UPDATE public.sales_orders SET test_tune_status='active',test_tune_start_date=p.substantial_completion_date,test_tune_end_date=g.expiration_date WHERE id=p.sales_order_id AND organization_id=p.organization_id; END IF;
  -- Existing/manual grants are not assumed undelivered and are never bulk-reinvited.
  IF NOT v_created AND NOT p.test_tune_invite_managed THEN CONTINUE; END IF;
  result=result||jsonb_build_array(jsonb_build_object('project_id',p.id,'organization_id',p.organization_id,'contact_id',c.id,'contact_email',c.email,'contact_name',coalesce(c.full_name,c.company_name,'Customer'),'project_name',p.name,'expiration_date',g.expiration_date,'grant_id',g.id));
 END LOOP;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_due_test_tune_invites() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_due_test_tune_invites() TO service_role;

-- A dedicated Vault token authenticates the scheduled Edge Function without embedding a service key in cron.
CREATE OR REPLACE FUNCTION private.queue_test_tune_start_run()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_token text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='test_tune_scheduler_url';
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='test_tune_scheduler_token';
 IF nullif(v_url,'') IS NULL OR nullif(v_token,'') IS NULL THEN RAISE EXCEPTION 'Configure the Test & Tune scheduler URL and token before activation'; END IF;
 SELECT net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/process-test-tune-starts',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),body:='{}'::jsonb) INTO request_id;
 RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION private.queue_test_tune_start_run() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE job_id bigint; BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='process-test-tune-starts-daily') THEN PERFORM cron.unschedule('process-test-tune-starts-daily'); END IF;
 SELECT cron.schedule('process-test-tune-starts-daily','15 13 * * *','SELECT private.queue_test_tune_start_run();') INTO job_id;
 PERFORM cron.alter_job(job_id,active:=false);
 -- Release activation is deliberate, after credentials and Edge Functions are verified.
END $$;
NOTIFY pgrst,'reload schema';
