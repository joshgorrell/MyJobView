-- Authorized by Josh: historical Rewards balances/history were test data.
-- Scope is Electronic Life. Catalog configuration and work records are retained.
DO $$
DECLARE org uuid; t text; owner_column text;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE subdomain='elife';
 IF org IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.profiles WHERE organization_id=org ORDER BY id FOR UPDATE;
 UPDATE public.company_settings SET rewards_reset_at=clock_timestamp() WHERE organization_id=org;
 DELETE FROM public.reward_redemptions WHERE organization_id=org;
 -- Attendance's trigger intentionally rejects direct DELETE even for postgres.
 -- Transactional ALTER holds a table lock; restore before leaving this migration.
 ALTER TABLE public.points_transactions DISABLE TRIGGER protect_attendance_ledger;
 DELETE FROM public.points_transactions WHERE organization_id=org;
 ALTER TABLE public.points_transactions ENABLE TRIGGER protect_attendance_ledger;
 -- Clear the old, disconnected test ledgers as well, if installed.
 FOREACH t IN ARRAY ARRAY['user_points','points_history','points_log','point_events','clock_out_rewards_log'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
  SELECT column_name INTO owner_column FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name IN ('user_id','technician_id') ORDER BY CASE WHEN column_name='user_id' THEN 0 ELSE 1 END LIMIT 1;
  IF owner_column IS NOT NULL THEN EXECUTE format('DELETE FROM public.%I x USING public.profiles p WHERE x.%I=p.id AND p.organization_id=$1',t,owner_column) USING org; END IF;
 END LOOP;
 UPDATE public.profiles SET points_earned=0 WHERE organization_id=org;
END $$;
