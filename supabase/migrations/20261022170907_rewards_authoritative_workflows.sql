-- Server-owned Rewards workflows. No historical balances or awards are recalculated.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS rewards_reset_at timestamptz;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
ALTER TABLE public.points_transactions ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS reward_event_once ON public.points_transactions(organization_id,source_key) WHERE source_key IS NOT NULL;
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS request_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS reward_request_once ON public.reward_redemptions(organization_id,user_id,request_key) WHERE request_key IS NOT NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reward_completion_id uuid;
ALTER TABLE public.discussion_posts ADD COLUMN IF NOT EXISTS reward_completion_id uuid;

CREATE OR REPLACE FUNCTION private.rewards_actor_org(p_admin boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.profiles;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role NOT IN ('portal_user','customer');
 IF NOT FOUND OR (p_admin AND actor.role NOT IN ('admin','owner','super_admin')) THEN RAISE EXCEPTION 'Employee authorization required' USING ERRCODE='42501'; END IF;
 RETURN actor.organization_id;
END $$;
REVOKE ALL ON FUNCTION private.rewards_actor_org(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.rewards_actor_org(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.post_reward_points(p_org uuid,p_user uuid,p_points integer,p_type text,p_reference uuid,p_description text,p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_org IS NULL OR p_key IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND organization_id=p_org) THEN RAISE EXCEPTION 'Invalid points beneficiary'; END IF;
 IF p_points=0 THEN RETURN; END IF;
 INSERT INTO public.points_transactions(organization_id,user_id,points_amount,transaction_type,reference_id,description,source_key)
 VALUES(p_org,p_user,p_points,p_type,p_reference,p_description,p_key)
 ON CONFLICT(organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION private.post_reward_points(uuid,uuid,integer,text,uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Row-locked delta updates avoid concurrent SUM snapshots and preserve legacy balances.
CREATE OR REPLACE FUNCTION public.sync_profile_points() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.profiles SET points_earned=coalesce(points_earned,0)+NEW.points_amount WHERE id=NEW.user_id AND organization_id=NEW.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Points organization does not match beneficiary'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_profile_points() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.protect_reward_balance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.points_earned,0)<>0 ELSE NEW.points_earned IS DISTINCT FROM OLD.points_earned END) THEN RAISE EXCEPTION 'Use an authorized Rewards workflow' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_reward_balance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_reward_balance BEFORE INSERT OR UPDATE OF points_earned ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_reward_balance();

-- No browser may choose an arbitrary award amount. Trusted server jobs retain access.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='award_points' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.oid::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.get_user_points_balance(user_uuid uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); result integer;
BEGIN
 IF user_uuid<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','owner','super_admin')) THEN RAISE EXCEPTION 'Own balance only' USING ERRCODE='42501'; END IF;
 SELECT points_earned INTO result FROM public.profiles WHERE id=user_uuid AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
 RETURN coalesce(result,0);
END $$;
REVOKE ALL ON FUNCTION public.get_user_points_balance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_points_balance(uuid) TO authenticated;

-- Direct status/claim edits must not skip atomic points workflows.
CREATE OR REPLACE FUNCTION private.guard_reward_completion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb;
BEGIN
 IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
 IF n->>'organization_id' IS DISTINCT FROM public.get_user_org_id()::text THEN RAISE EXCEPTION 'Assignment organization mismatch'; END IF;
 IF TG_OP='INSERT' THEN
  IF n->>'user_id' IS DISTINCT FROM auth.uid()::text AND NOT private.is_rewards_admin() THEN RAISE EXCEPTION 'Assignment creator must be the authenticated employee'; END IF;
  IF coalesce((n->>'is_completed')::boolean,false) OR n->>'status'='completed' OR n->>'completed_by' IS NOT NULL OR n->>'reward_completion_id' IS NOT NULL THEN RAISE EXCEPTION 'Use atomic completion'; END IF;
 ELSE
  o:=to_jsonb(OLD);
  IF n->'user_id' IS DISTINCT FROM o->'user_id' OR n->'organization_id' IS DISTINCT FROM o->'organization_id' THEN RAISE EXCEPTION 'Assignment creator and organization are immutable'; END IF;
  IF n->'points' IS DISTINCT FROM o->'points' AND auth.uid() IS DISTINCT FROM OLD.user_id AND NOT private.is_rewards_admin() THEN RAISE EXCEPTION 'Only the creator or administrator may set assignment points'; END IF;
  IF n->'is_completed' IS DISTINCT FROM o->'is_completed' OR n->'completed_by' IS DISTINCT FROM o->'completed_by' OR n->'completed_at' IS DISTINCT FROM o->'completed_at' OR n->'reward_completion_id' IS DISTINCT FROM o->'reward_completion_id' OR (n->>'status' IS DISTINCT FROM o->>'status' AND (n->>'status'='completed' OR o->>'status'='completed')) THEN RAISE EXCEPTION 'Use atomic completion'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_reward_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_reward_completion BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION private.guard_reward_completion();
CREATE TRIGGER guard_reward_completion BEFORE INSERT OR UPDATE ON public.discussion_posts FOR EACH ROW EXECUTE FUNCTION private.guard_reward_completion();
-- The old trigger writes a second, obsolete user_points/points_history system.
DROP TRIGGER IF EXISTS award_points_on_task_completion ON public.tasks;

CREATE OR REPLACE FUNCTION public.complete_task_atomic(p_task_id uuid)
RETURNS TABLE (
  task_id uuid,
  completed_by uuid,
  points_awarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_points integer := 0;
  v_completer_name text;
  v_org uuid := private.rewards_actor_org();
  v_event uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id AND organization_id=v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  SELECT (role IN ('admin','owner','super_admin')) INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF v_task.assigned_to IS NOT NULL THEN
    IF v_task.assigned_to <> v_user_id
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'This task is assigned to another user';
    END IF;
  ELSIF v_task.assigned_department_id IS NOT NULL THEN
    IF NOT private.user_has_department_access(v_user_id, v_task.assigned_department_id)
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'You do not have access to this department task';
    END IF;
  END IF;

  IF v_task.status = 'completed' THEN
    RETURN QUERY SELECT p_task_id,v_task.completed_by,0; RETURN;
  END IF;

  v_points := COALESCE(v_task.points, 0);
  IF v_task.user_id=v_user_id THEN v_points:=0; END IF;
  IF v_points<0 THEN RAISE EXCEPTION 'Invalid task points'; END IF;

  UPDATE tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = v_user_id,
      claimed_by = v_user_id, reward_completion_id=v_event
  WHERE id = p_task_id;

  IF v_points > 0 THEN
    PERFORM private.post_reward_points(v_org,v_user_id,v_points,'task_completion',p_task_id,'Completed task: '||v_task.title,'task:'||p_task_id||':'||v_event);
  END IF;

  SELECT COALESCE(full_name, 'Team member')
    INTO v_completer_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO notifications (organization_id,user_id, title, body, type, is_read, related_id, created_at)
  SELECT v_org,recipients.user_id,
         'Task Completed',
         v_task.title || ' — completed by ' || COALESCE(v_completer_name, 'Team member'),
         'task',
         false,
         p_task_id,
         now()
  FROM (
    SELECT v_task.user_id AS user_id
    UNION
    SELECT tw.user_id
    FROM task_watchers tw
    WHERE tw.task_id = p_task_id
  ) recipients
  WHERE recipients.user_id IS NOT NULL
    AND recipients.user_id <> v_user_id
    AND EXISTS(SELECT 1 FROM profiles WHERE id=recipients.user_id AND organization_id=v_org AND is_active IS TRUE);

  RETURN QUERY SELECT p_task_id, v_user_id, v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task_atomic(uuid) TO authenticated;


-- Reverse the net points actually awarded for the completed task, not the
-- mutable task.points field. The task row lock serializes reopen operations.
CREATE OR REPLACE FUNCTION public.reopen_task_atomic(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_net_award integer := 0;
  v_org uuid := private.rewards_actor_org();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  SELECT (role IN ('admin','owner','super_admin')) INTO v_is_admin
  FROM public.profiles WHERE id = v_user_id;

  IF v_task.user_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the task creator or an admin can reopen this task';
  END IF;

  IF v_task.status <> 'completed' THEN RETURN; END IF;

  IF v_task.completed_by IS NOT NULL THEN
    -- Net transactions include prior awards and adjustments/reversals for
    -- this task, so repeated completion cycles are reconciled correctly.
    SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_net_award
    FROM public.points_transactions
    WHERE organization_id=v_org AND user_id = v_task.completed_by
      AND reference_id = p_task_id
      AND (
        transaction_type = 'task_completion'
        OR (transaction_type = 'admin_adjustment'
            AND description LIKE 'Points reversed — task reopened:%')
      );

    IF v_net_award > 0 THEN
      PERFORM private.post_reward_points(v_org,v_task.completed_by,-v_net_award,'admin_adjustment',p_task_id,'Points reversed — task reopened: '||v_task.title,'task_reopen:'||p_task_id||':'||coalesce(v_task.reward_completion_id::text,'legacy'));
    END IF;
  END IF;

  UPDATE public.tasks
  SET status = 'pending', completed_at = NULL,
      completed_by = NULL, claimed_by = NULL
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_task_atomic(uuid) TO authenticated;

-- Tasks and questions in Fishbowl use one locked server transaction.
CREATE OR REPLACE FUNCTION public.set_discussion_task_completion(p_post_id uuid,p_complete boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); actor uuid:=auth.uid(); p public.discussion_posts; is_admin boolean;
 amount integer; outstanding integer; event uuid:=gen_random_uuid(); kind text;
BEGIN
 SELECT * INTO p FROM public.discussion_posts WHERE id=p_post_id AND organization_id=org AND post_type IN ('task','question') AND parent_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
 -- Preserve restrictive discussion-audience authorization as well as assignment.
 IF NOT public.flow_can_view_discussion(p_post_id) THEN RAISE EXCEPTION 'Assignment access required'; END IF;
 SELECT role IN ('admin','owner','super_admin') INTO is_admin FROM public.profiles WHERE id=actor;
 IF actor IS DISTINCT FROM p.user_id AND actor IS DISTINCT FROM p.assigned_to AND NOT is_admin AND p.assigned_to IS NOT NULL THEN RAISE EXCEPTION 'Assignment belongs to another employee'; END IF;
 IF p_complete THEN
  IF coalesce(p.is_completed,false) THEN RETURN; END IF;
  SELECT CASE WHEN p.post_type='question' THEN question_answer_points ELSE task_completion_points END INTO amount FROM public.points_configuration WHERE organization_id=org ORDER BY updated_at DESC,id LIMIT 1;
  amount:=CASE WHEN p.post_type='question' THEN coalesce(amount,5) ELSE coalesce(p.points,amount,10) END;
  IF p.user_id=actor THEN amount:=0; END IF;
  IF amount<0 THEN RAISE EXCEPTION 'Invalid assignment points'; END IF;
  kind:=CASE WHEN p.post_type='question' THEN 'question_answer' ELSE 'task_completion' END;
  UPDATE public.discussion_posts SET is_completed=true,completed_at=now(),completed_by=actor,reward_completion_id=event WHERE id=p_post_id;
  PERFORM private.post_reward_points(org,actor,amount,kind,p_post_id,'Completed discussion assignment: '||left(p.content,100),'discussion:'||p_post_id||':'||event);
  IF amount>0 THEN INSERT INTO public.notifications(organization_id,user_id,type,title,body) VALUES(org,actor,'system','+'||amount||' Points!','You earned '||amount||' points for completing an assignment'); END IF;
 ELSE
  IF actor IS DISTINCT FROM p.user_id AND NOT is_admin THEN RAISE EXCEPTION 'Creator or administrator required to reopen'; END IF;
  IF NOT coalesce(p.is_completed,false) THEN RETURN; END IF;
  SELECT coalesce(sum(points_amount),0)::integer INTO outstanding FROM public.points_transactions WHERE organization_id=org AND user_id=p.completed_by AND reference_id=p_post_id AND (transaction_type IN ('task_completion','question_answer') OR (transaction_type='admin_adjustment' AND description LIKE 'Points reversed — discussion task reopened:%'));
  IF outstanding>0 THEN PERFORM private.post_reward_points(org,p.completed_by,-outstanding,'admin_adjustment',p_post_id,'Points reversed — discussion task reopened: '||left(p.content,100),'discussion_reopen:'||p_post_id||':'||coalesce(p.reward_completion_id::text,'legacy')); END IF;
  UPDATE public.discussion_posts SET is_completed=false,completed_at=NULL,completed_by=NULL WHERE id=p_post_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_discussion_task_completion(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_discussion_task_completion(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid,p_request_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); actor uuid:=auth.uid(); balance integer; r public.rewards_catalog; previous public.reward_redemptions; redemption uuid;
BEGIN
 IF NOT public.flow_has_module_access('rewards_dashboard') THEN RAISE EXCEPTION 'Rewards access required' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request identity required'; END IF;
 SELECT points_earned INTO balance FROM public.profiles WHERE id=actor AND organization_id=org FOR UPDATE;
 SELECT * INTO previous FROM public.reward_redemptions WHERE organization_id=org AND user_id=actor AND request_key=p_request_key;
 IF FOUND THEN
  IF previous.reward_id<>p_reward_id THEN RAISE EXCEPTION 'Request identity already used for another reward'; END IF;
  RETURN;
 END IF;
 SELECT * INTO r FROM public.rewards_catalog WHERE id=p_reward_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(r.available,false) OR coalesce(r.points_cost,0)<=0 OR coalesce(r.stock_quantity,1)<=0 THEN RAISE EXCEPTION 'Reward unavailable'; END IF;
 IF coalesce(balance,0)<r.points_cost THEN RAISE EXCEPTION 'Insufficient points'; END IF;
 INSERT INTO public.reward_redemptions(organization_id,user_id,reward_id,points_spent,status,request_key)
 VALUES(org,actor,r.id,r.points_cost,'pending',p_request_key) RETURNING id INTO redemption;
 PERFORM private.post_reward_points(org,actor,-r.points_cost,'reward_redemption',redemption,'Redeemed: '||r.name,'redemption:'||redemption);
 IF r.stock_quantity IS NOT NULL THEN UPDATE public.rewards_catalog SET stock_quantity=stock_quantity-1 WHERE id=r.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.redeem_reward_atomic(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward_atomic(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.redeem_reward_atomic(p_reward_id,gen_random_uuid()); END $$;
REVOKE ALL ON FUNCTION public.redeem_reward_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_reward_redemption_status(p_redemption_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(true); d public.reward_redemptions; locked_user uuid;
BEGIN
 -- Same lock order as redemption: profile, redemption, reward.
 SELECT user_id INTO locked_user FROM public.reward_redemptions WHERE id=p_redemption_id AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=locked_user AND organization_id=org FOR UPDATE;
 SELECT * INTO d FROM public.reward_redemptions WHERE id=p_redemption_id AND organization_id=org FOR UPDATE;
 IF d.status=p_status THEN RETURN; END IF;
 IF NOT ((d.status='pending' AND p_status IN ('approved','cancelled')) OR (d.status='approved' AND p_status IN ('fulfilled','cancelled'))) THEN RAISE EXCEPTION 'Invalid redemption transition'; END IF;
 IF p_status='cancelled' THEN
  IF d.request_key IS NULL THEN RAISE EXCEPTION 'Legacy redemption requires debit reconciliation before cancellation'; END IF;
  PERFORM private.post_reward_points(org,d.user_id,d.points_spent,'admin_adjustment',d.id,'Cancelled reward refunded','redemption_refund:'||d.id);
  UPDATE public.rewards_catalog SET stock_quantity=stock_quantity+1 WHERE id=d.reward_id AND organization_id=org AND stock_quantity IS NOT NULL;
 END IF;
 UPDATE public.reward_redemptions SET status=p_status,fulfilled_at=CASE WHEN p_status='fulfilled' THEN now() ELSE NULL END WHERE id=d.id;
END $$;
REVOKE ALL ON FUNCTION public.set_reward_redemption_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_reward_redemption_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_reward_points(p_user_id uuid,p_points integer,p_reason text,p_request_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(true);
BEGIN
 IF p_user_id=auth.uid() OR p_points=0 OR p_request_key IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Another employee, amount, reason and request identity required'; END IF;
 PERFORM private.post_reward_points(org,p_user_id,p_points,'admin_adjustment',p_request_key,trim(p_reason),'admin_adjustment:'||p_request_key);
END $$;
REVOKE ALL ON FUNCTION public.adjust_reward_points(uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_reward_points(uuid,integer,text,uuid) TO authenticated;

-- Catalog/configuration management is an active administrator capability.
CREATE OR REPLACE FUNCTION private.is_rewards_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role IN ('admin','owner','super_admin'));
$$;
REVOKE ALL ON FUNCTION private.is_rewards_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_rewards_admin() TO authenticated;
DO $$ DECLARE p record; t text; cols text; BEGIN
 FOREACH t IN ARRAY ARRAY['points_configuration','rewards_catalog'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd IN ('INSERT','UPDATE','DELETE','ALL') LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t); END LOOP;
  EXECUTE format('CREATE POLICY rewards_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(organization_id=public.get_user_org_id() AND private.is_rewards_admin())',t);
  EXECUTE format('CREATE POLICY rewards_admin_update ON public.%I FOR UPDATE TO authenticated USING(organization_id=public.get_user_org_id() AND private.is_rewards_admin()) WITH CHECK(organization_id=public.get_user_org_id() AND private.is_rewards_admin())',t);
  EXECUTE format('CREATE POLICY rewards_admin_delete ON public.%I FOR DELETE TO authenticated USING(organization_id=public.get_user_org_id() AND private.is_rewards_admin())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['points_transactions','reward_redemptions'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM PUBLIC,anon,authenticated',t);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,t);
 END LOOP;
END $$;

-- These events originate from validated source rows, never from browser amounts.
CREATE OR REPLACE FUNCTION private.award_configured_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=NEW.organization_id; beneficiary uuid; cfg public.points_configuration; amount integer; event text; description text; j jsonb:=to_jsonb(NEW);
BEGIN
 SELECT * INTO cfg FROM public.points_configuration WHERE organization_id=org ORDER BY updated_at DESC,id LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='contacts' THEN beneficiary:=NEW.created_by;amount:=cfg.contact_created_points;event:='contact_created';description:='Contact created';
 ELSIF TG_TABLE_NAME='connections' THEN beneficiary:=NEW.user_id;amount:=cfg.connection_logged_points;event:='connection_logged';description:='Connection logged';
 ELSIF TG_TABLE_NAME='discussion_posts' THEN
  IF coalesce(NEW.is_private,false) OR NEW.parent_id IS NOT NULL OR NEW.post_type<>'general' THEN RETURN NEW; END IF;
  beneficiary:=NEW.user_id;amount:=cfg.fishbowl_post_points;event:='fishbowl_post';description:='Public Fishbowl post created';
 ELSIF TG_TABLE_NAME='leads' THEN
  IF TG_OP='INSERT' THEN beneficiary:=NEW.created_by;amount:=cfg.lead_created_points;event:='lead_created';description:='Lead created';
  ELSE
   beneficiary:=NEW.assigned_to;
   IF OLD.status='unclaimed' AND NEW.status='claimed' THEN amount:=cfg.lead_claimed_points;event:='lead_claimed';description:='Lead claimed';
   ELSIF OLD.status IS DISTINCT FROM 'converted' AND NEW.status='converted' THEN amount:=cfg.lead_converted_points;event:='lead_converted';description:='Lead converted';
   ELSE RETURN NEW; END IF;
  END IF;
 END IF;
 IF coalesce(amount,0)<=0 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=beneficiary AND organization_id=org AND is_active IS TRUE AND role NOT IN ('portal_user','customer')) THEN RETURN NEW; END IF;
 PERFORM private.post_reward_points(org,beneficiary,amount,'admin_adjustment',NEW.id,description,event||':'||NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.award_configured_activity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trigger_award_points_contact ON public.contacts;
DROP TRIGGER IF EXISTS trigger_award_points_connection ON public.connections;
DROP TRIGGER IF EXISTS trigger_award_points_lead_created ON public.leads;
DROP TRIGGER IF EXISTS trigger_award_points_lead_status ON public.leads;
DROP TRIGGER IF EXISTS trigger_award_points_fishbowl_post ON public.discussion_posts;
CREATE TRIGGER reward_contact AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION private.award_configured_activity();
CREATE TRIGGER reward_connection AFTER INSERT ON public.connections FOR EACH ROW EXECUTE FUNCTION private.award_configured_activity();
CREATE TRIGGER reward_lead AFTER INSERT OR UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION private.award_configured_activity();
CREATE TRIGGER reward_fishbowl AFTER INSERT ON public.discussion_posts FOR EACH ROW EXECUTE FUNCTION private.award_configured_activity();

CREATE OR REPLACE FUNCTION private.award_uploaded_media() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE amount integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.technician_id AND organization_id=NEW.organization_id AND is_active IS TRUE AND role NOT IN ('portal_user','customer')) THEN RAISE EXCEPTION 'Invalid photo employee'; END IF;
 IF auth.uid() IS NOT NULL AND auth.uid()<>NEW.technician_id THEN RAISE EXCEPTION 'Photo must belong to uploader'; END IF;
 SELECT photo_upload_points INTO amount FROM public.company_settings WHERE organization_id=NEW.organization_id LIMIT 1;
 IF coalesce(amount,0)>0 THEN PERFORM private.post_reward_points(NEW.organization_id,NEW.technician_id,amount,'admin_adjustment',NEW.id,'Uploaded job '||CASE WHEN NEW.media_type='video' THEN 'video' ELSE 'photo' END,'job_media:'||NEW.id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.award_uploaded_media() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS job_photo_points_trigger ON public.job_photos;
DROP TRIGGER IF EXISTS trigger_award_job_photo_points ON public.job_photos;
CREATE TRIGGER reward_uploaded_media AFTER INSERT ON public.job_photos FOR EACH ROW EXECUTE FUNCTION private.award_uploaded_media();

-- Legacy conversion RPCs may insert the same event as a source trigger. Normalize
-- only recognized event identities; never touch historical rows.
CREATE OR REPLACE FUNCTION private.guard_reward_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=NEW.user_id;
 IF org IS NULL OR NEW.organization_id IS DISTINCT FROM org THEN RAISE EXCEPTION 'Points beneficiary organization mismatch'; END IF;
 IF NEW.transaction_type='attendance' AND EXISTS(SELECT 1 FROM public.daily_clock_entries e JOIN public.company_settings c ON c.organization_id=NEW.organization_id WHERE e.id=NEW.reference_id AND e.clock_in<c.rewards_reset_at) THEN RETURN NULL; END IF;
 IF NEW.source_key IS NULL AND NEW.reference_id IS NOT NULL AND NEW.transaction_type='admin_adjustment' THEN
  IF NEW.description LIKE 'Points deducted for manual time entry:%' THEN NEW.source_key:='manual_entry:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Points deducted for same-day %' THEN NEW.source_key:='same_day_callin:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Lead created:%' THEN NEW.source_key:='lead_created:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Lead claimed:%' THEN NEW.source_key:='lead_claimed:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Lead converted:%' THEN NEW.source_key:='lead_converted:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Contact created:%' THEN NEW.source_key:='contact_created:'||NEW.reference_id;
  ELSIF NEW.description LIKE 'Connection logged with %' THEN NEW.source_key:='connection_logged:'||NEW.reference_id; END IF;
 END IF;
 IF NEW.source_key IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(org::text||':'||NEW.source_key,0));
  IF EXISTS(SELECT 1 FROM public.points_transactions WHERE organization_id=org AND source_key=NEW.source_key) THEN RETURN NULL; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_reward_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_reward_event BEFORE INSERT ON public.points_transactions FOR EACH ROW EXECUTE FUNCTION private.guard_reward_event();

-- A complete menu of effective automatic rules, plus values shown on assignments.
-- No proposal/review award is invented: these have no verified points producer.
CREATE OR REPLACE FUNCTION public.get_reward_points_menu()
RETURNS TABLE(id text,category text,name text,description text,points integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); c public.points_configuration; s public.company_settings;
BEGIN
 IF NOT public.flow_has_module_access('rewards_dashboard') THEN RAISE EXCEPTION 'Rewards access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.points_configuration WHERE organization_id=org ORDER BY updated_at DESC,id LIMIT 1;
 SELECT * INTO s FROM public.company_settings WHERE organization_id=org LIMIT 1;
 RETURN QUERY SELECT v.* FROM (VALUES
 ('task_completion','Assignments','Complete an assignment','Earn the value shown on the assignment. The first eligible resolver receives the award. Creators do not earn points for their own assignments.',NULL::integer),
 ('question_answer','Assignments','Answer a Fishbowl question','The first eligible answer completion earns points; reopening reverses the actual award.',coalesce(c.question_answer_points,5)),
 ('contact_created','Customer activity','Create a contact','One award for a new employee-created contact.',coalesce(c.contact_created_points,0)),
 ('connection_logged','Customer activity','Log a connection','One award per saved connection.',coalesce(c.connection_logged_points,0)),
 ('lead_created','Customer activity','Create a lead','Anonymous lead submissions do not earn employee points.',coalesce(c.lead_created_points,0)),
 ('lead_claimed','Customer activity','Claim a lead','One award when an unclaimed lead is claimed.',coalesce(c.lead_claimed_points,0)),
 ('lead_converted','Customer activity','Convert a lead','One award when a lead becomes converted.',coalesce(c.lead_converted_points,0)),
 ('fishbowl_post','Team activity','Create a public Fishbowl post','One award for an original public general post; replies and private posts are excluded.',coalesce(c.fishbowl_post_points,0)),
 ('job_media','Job documentation','Upload a job photo or video','One award per saved upload, to its uploader.',coalesce(s.photo_upload_points,0)),
 ('attendance_early','Attendance','Arrive at least 15 minutes early','First qualifying daily clock-in; schedule, holiday and approved PTO exclusions apply.',10),
 ('attendance_on_time','Attendance','Arrive on time','First qualifying daily clock-in at or before the scheduled start.',5),
 ('attendance_late','Attendance','Arrive 1–15 minutes late','First qualifying daily clock-in; earlier offline arrivals are reconciled.',-5),
 ('attendance_very_late','Attendance','Arrive more than 15 minutes late','First qualifying daily clock-in.',-10),
 ('forgot_clock_out','Deductions','Forgot to clock out','Penalty when the company automatic clock-out job closes a forgotten daily clock entry.',CASE WHEN coalesce((to_jsonb(s)->>'auto_clock_out_enabled')::boolean,false) THEN coalesce((to_jsonb(s)->>'forgot_clock_out_penalty_points')::integer,-15) ELSE 0 END),
 ('manual_time_entry','Deductions','Manual time entry deduction','Applied only when an authorized manual correction explicitly requests a deduction.',-coalesce(c.manual_entry_points_loss,10)),
 ('same_day_callin','Deductions','Same-day PTO call-in after cutoff','Company cutoff: '||coalesce(s.pto_same_day_callin_cutoff_time::text,'07:00:00')||'. Exempt leave types are excluded.',-coalesce(s.pto_same_day_callin_points_loss,10))
 ) v(id,category,name,description,points) WHERE v.points IS NULL OR v.points<>0;
END $$;
REVOKE ALL ON FUNCTION public.get_reward_points_menu() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reward_points_menu() TO authenticated;
CREATE OR REPLACE FUNCTION public.deduct_manual_entry_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_points_to_deduct integer;
BEGIN
-- Only process if this is a manual entry that should deduct points
IF NEW.admin_adjusted = true AND NEW.deduct_points = true AND NEW.points_deducted = 0 THEN
-- Get the configured points loss amount
SELECT manual_entry_points_loss INTO v_points_to_deduct
FROM points_configuration WHERE organization_id=NEW.organization_id
ORDER BY updated_at DESC,id LIMIT 1;

-- Default to 10 if no configuration exists
IF v_points_to_deduct IS NULL THEN
v_points_to_deduct := 10;
END IF;

-- Record the points deducted
NEW.points_deducted := v_points_to_deduct;

-- Deduct points from the technician's profile
-- Profile balance is updated exactly once by the ledger trigger.

-- Create a points transaction record
INSERT INTO points_transactions (
organization_id,
user_id,
points_amount,
transaction_type,
reference_id,
description
) VALUES (
NEW.organization_id,
NEW.technician_id,
-v_points_to_deduct,
'admin_adjustment',
NEW.id,
'Points deducted for manual time entry: ' || COALESCE(NEW.adjustment_reason, 'No reason provided')
);
END IF;

RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_same_day_callin_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_cutoff_time time;
v_points_loss integer;
v_current_time time;
v_policy_type text;
v_is_same_day boolean := false;
BEGIN
-- Only process new pending requests
IF NEW.status <> 'pending' THEN
RETURN NEW;
END IF;

-- Get the PTO policy type
SELECT pto_type INTO v_policy_type
FROM pto_policies
WHERE id = NEW.policy_id;

-- Bereavement and jury duty are exempt from same-day penalties
IF v_policy_type IN ('bereavement', 'jury_duty', 'unpaid') THEN
RETURN NEW;
END IF;

-- Check if this is a same-day call-in
IF NEW.start_date = (SELECT (now() AT TIME ZONE coalesce(timezone,'America/Chicago'))::date FROM public.organizations WHERE id=NEW.organization_id) THEN
v_is_same_day := true;
NEW.is_same_day_callin := true;

-- Get cutoff time and points loss from company settings
SELECT
pto_same_day_callin_cutoff_time,
pto_same_day_callin_points_loss
INTO v_cutoff_time, v_points_loss
FROM company_settings WHERE organization_id=NEW.organization_id
LIMIT 1;

-- Defaults if no settings row
IF v_cutoff_time IS NULL THEN
v_cutoff_time := '07:00:00';
END IF;
IF v_points_loss IS NULL THEN
v_points_loss := 10;
END IF;

-- Get current time (timezone-aware)
v_current_time := (now() AT TIME ZONE (SELECT coalesce(timezone,'America/Chicago') FROM public.organizations WHERE id=NEW.organization_id))::time;

-- Only deduct points if submitted after the cutoff time
IF v_current_time > v_cutoff_time THEN
NEW.points_deducted := v_points_loss;

-- Deduct from the employee's rewards balance
-- Profile balance is updated exactly once by the ledger trigger.

-- Record the transaction
INSERT INTO points_transactions (
organization_id,
user_id,
points_amount,
transaction_type,
reference_id,
description
) VALUES (
NEW.organization_id,
NEW.employee_id,
-v_points_loss,
'admin_adjustment',
NEW.id,
'Points deducted for same-day ' || v_policy_type || ' call-in'
);
END IF;
END IF;

RETURN NEW;
END;
$function$;


-- Compatibility for trusted scheduled jobs; browser EXECUTE remains revoked.
CREATE OR REPLACE FUNCTION public.award_points(p_user_id uuid,p_points integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid; event text;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=p_user_id;
 IF org IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;
 event:=CASE WHEN p_reason LIKE 'Automatic clock-out penalty%' THEN 'auto_clockout:'||p_user_id||':'||md5(p_reason) ELSE 'trusted:'||gen_random_uuid() END;
 PERFORM private.post_reward_points(org,p_user_id,p_points,'admin_adjustment',NULL,p_reason,event);
END $$;
REVOKE ALL ON FUNCTION public.award_points(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(uuid,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION private.is_rewards_employee() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role NOT IN ('portal_user','customer'));
$$;
REVOKE ALL ON FUNCTION private.is_rewards_employee() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_rewards_employee() TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['points_configuration','rewards_catalog','points_transactions','reward_redemptions'] LOOP
  EXECUTE format('CREATE POLICY rewards_employee_read ON public.%I FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND private.is_rewards_employee())',t);
  EXECUTE format('CREATE POLICY rewards_employee_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND private.is_rewards_employee())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['points_transactions','reward_redemptions'] LOOP
  EXECUTE format('CREATE POLICY rewards_history_owner_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(user_id=auth.uid() OR private.is_rewards_admin())',t);
 END LOOP;
END $$;

-- Preserve the scheduled job contract while scoping its records and notifications
-- to the selected company, and excluding pre-reset test entries from penalties.
CREATE OR REPLACE FUNCTION public.auto_clock_out_forgotten_entries()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_settings                record;
v_reset_at timestamptz;
v_penalty_entry record;
v_cutoff_time             time;
v_default_clock_out_time  time;
v_cutoff_timestamp        timestamptz;
v_penalty_points          integer;
v_affected_count          integer := 0;
v_job_entries_count       integer := 0;
v_execution_start         timestamptz := clock_timestamp();
v_execution_log_id        uuid;
v_entry_ids               uuid[]  := '{}';
v_tech_ids                uuid[]  := '{}';
v_tech_names              text[]  := '{}';
v_total_points            integer := 0;
v_admin_ids               uuid[]  := '{}';
v_notification_ids        uuid[]  := '{}';
v_notification_id         uuid;
v_admin_id                uuid;
v_execution_duration      integer;
v_timezone                text;
v_org_id                  uuid;
v_cutoff_date             date;
BEGIN
-- Get company settings including timezone
SELECT
organization_id,
auto_clock_out_enabled,
auto_clock_out_cutoff_time,
auto_clock_out_time,
forgot_clock_out_penalty_points,
home_clock_notification_roles,
rewards_reset_at,
COALESCE(timezone, 'America/Chicago') AS tz
INTO v_settings
FROM company_settings
WHERE organization_id IS NOT NULL
ORDER BY organization_id
LIMIT 1;

IF v_settings IS NULL THEN
RETURN jsonb_build_object(
'success',           false,
'message',           'No company settings found',
'entries_processed', 0
);
END IF;

v_org_id   := COALESCE(v_settings.organization_id, (SELECT id FROM organizations LIMIT 1));
v_timezone := v_settings.tz;
v_reset_at := v_settings.rewards_reset_at;

IF NOT v_settings.auto_clock_out_enabled THEN
RETURN jsonb_build_object(
'success',           false,
'message',           'Auto clock-out is not enabled',
'entries_processed', 0
);
END IF;

v_cutoff_time            := COALESCE(v_settings.auto_clock_out_cutoff_time, '22:00:00'::time);
v_default_clock_out_time := COALESCE(v_settings.auto_clock_out_time,        '16:00:00'::time);
v_penalty_points         := COALESCE(v_settings.forgot_clock_out_penalty_points, -15);

-- Determine the cutoff date in the org's local timezone.
-- FIX: cast the date arithmetic result back to ::date — subtracting an interval
--      from a date returns `timestamp without time zone` in Postgres, not date,
--      so ::text would produce "YYYY-MM-DD 00:00:00" instead of "YYYY-MM-DD".
IF (now() AT TIME ZONE v_timezone)::time >= v_cutoff_time THEN
v_cutoff_date := (now() AT TIME ZONE v_timezone)::date;
ELSE
v_cutoff_date := ((now() AT TIME ZONE v_timezone)::date - interval '1 day')::date;
END IF;

-- Build the cutoff timestamptz from clean date + time strings
v_cutoff_timestamp := (v_cutoff_date::text || ' ' || v_cutoff_time::text)::timestamp
AT TIME ZONE v_timezone;

-- -------------------------------------------------------
-- STEP A: Process daily_clock_entries (home / office clock)
-- -------------------------------------------------------
WITH entries_to_process AS (
SELECT
dce.id,
dce.technician_id,
dce.clock_in,
dce.entry_date,
p.full_name,
p.requires_daily_clock,
p.standard_end_time,
-- FIX: cast (entry_date + interval '1 day') back to ::date before ::text
CASE
WHEN p.standard_end_time IS NOT NULL THEN
CASE
WHEN (dce.entry_date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone > dce.clock_in
THEN (dce.entry_date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((dce.entry_date + interval '1 day')::date::text || ' ' || p.standard_end_time::text)::timestamp
AT TIME ZONE v_timezone
END
ELSE
CASE
WHEN (dce.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone > dce.clock_in
THEN (dce.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((dce.entry_date + interval '1 day')::date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
END
END AS calculated_clock_out
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
WHERE dce.organization_id=v_org_id AND p.organization_id=v_org_id
AND dce.status = 'clocked_in'
AND dce.clock_in < v_cutoff_timestamp
AND p.requires_daily_clock = true
AND dce.auto_clocked_out = false
),
updated_entries AS (
UPDATE daily_clock_entries dce
SET
clock_out               = etp.calculated_clock_out,
status                  = 'clocked_out',
total_hours             = GREATEST(
0,
EXTRACT(EPOCH FROM (etp.calculated_clock_out - dce.clock_in)) / 3600
),
deduct_points           = (v_reset_at IS NULL OR etp.clock_in>=v_reset_at),
points_deducted         = CASE WHEN v_reset_at IS NOT NULL AND etp.clock_in<v_reset_at THEN 0 ELSE v_penalty_points END,
auto_clocked_out        = true,
auto_clocked_out_at     = now(),
auto_clock_out_approved = false,
notes = COALESCE(notes || E'\n', '') ||
'Auto-clocked out at ' ||
to_char(etp.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') ||
'). Penalty: ' || CASE WHEN v_reset_at IS NOT NULL AND etp.clock_in<v_reset_at THEN 0 ELSE v_penalty_points END || ' points.'
FROM entries_to_process etp
WHERE dce.id = etp.id
AND etp.calculated_clock_out > dce.clock_in
RETURNING dce.id, dce.technician_id, dce.points_deducted, etp.full_name
)
SELECT
COALESCE(array_agg(id),                     '{}'),
COALESCE(array_agg(DISTINCT technician_id), '{}'),
COALESCE(array_agg(DISTINCT full_name),     '{}'),
COALESCE(SUM(ABS(points_deducted))::integer, 0)
INTO v_entry_ids, v_tech_ids, v_tech_names, v_total_points
FROM updated_entries;

v_affected_count := COALESCE(array_length(v_entry_ids, 1), 0);

-- -------------------------------------------------------
-- STEP B: Process open job time_entries (work-order clock)
-- -------------------------------------------------------
WITH job_entries_to_close AS (
SELECT
te.id,
te.technician_id,
te.clock_in,
te.entry_date,
-- FIX: same ::date cast on the +1 day branch
CASE
WHEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone > te.clock_in
THEN (te.entry_date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
ELSE ((te.entry_date + interval '1 day')::date::text || ' ' || v_default_clock_out_time::text)::timestamp
AT TIME ZONE v_timezone
END AS calculated_clock_out
FROM time_entries te
WHERE te.organization_id=v_org_id
AND te.status = 'clocked_in'
AND te.clock_in < v_cutoff_timestamp
AND te.clock_out IS NULL
),
updated_job_entries AS (
UPDATE time_entries te
SET
clock_out   = jec.calculated_clock_out,
status      = 'draft',
total_hours = GREATEST(
0,
EXTRACT(EPOCH FROM (jec.calculated_clock_out - te.clock_in)) / 3600
),
notes = COALESCE(notes || E'\n', '') ||
'Auto-clocked out at ' ||
to_char(jec.calculated_clock_out AT TIME ZONE v_timezone, 'YYYY-MM-DD HH12:MI:SS AM TZ') ||
' (cutoff was ' || to_char(v_cutoff_timestamp AT TIME ZONE v_timezone, 'HH12:MI:SS AM') || ').'
FROM job_entries_to_close jec
WHERE te.id = jec.id
AND jec.calculated_clock_out > te.clock_in
RETURNING te.id
)
SELECT COUNT(*)::integer INTO v_job_entries_count FROM updated_job_entries;

-- -------------------------------------------------------
-- Award penalty points and notify admins
-- -------------------------------------------------------
IF v_affected_count > 0 THEN
FOR v_penalty_entry IN SELECT * FROM daily_clock_entries WHERE id=ANY(v_entry_ids) AND (v_reset_at IS NULL OR clock_in>=v_reset_at) LOOP
PERFORM private.post_reward_points(v_org_id,v_penalty_entry.technician_id,v_penalty_points,'admin_adjustment',v_penalty_entry.id,'Automatic forgotten clock-out penalty','forgotten_entry:'||v_penalty_entry.id);
END LOOP;

IF v_settings.home_clock_notification_roles IS NOT NULL
AND array_length(v_settings.home_clock_notification_roles, 1) > 0
THEN
SELECT COALESCE(array_agg(DISTINCT id), '{}')
INTO   v_admin_ids
FROM   profiles
WHERE organization_id=v_org_id AND is_active IS TRUE AND role = ANY(v_settings.home_clock_notification_roles);
ELSE
SELECT COALESCE(array_agg(DISTINCT id), '{}')
INTO   v_admin_ids
FROM   profiles
WHERE organization_id=v_org_id AND is_active IS TRUE AND role IN ('admin', 'owner');
END IF;

IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
FOREACH v_admin_id IN ARRAY v_admin_ids LOOP
INSERT INTO notifications (
user_id, organization_id, type, title, body, related_id
) VALUES (
v_admin_id,
v_org_id,
'auto_clock_out',
'Auto Clock-Out: Needs Approval',
v_affected_count ||
' technician(s) were automatically clocked out and need approval before payroll. Click to review.',
NULL
)
RETURNING id INTO v_notification_id;

v_notification_ids := array_append(v_notification_ids, v_notification_id);
END LOOP;
END IF;
END IF;

-- -------------------------------------------------------
-- Log execution
-- -------------------------------------------------------
v_execution_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_execution_start)) * 1000;

INSERT INTO auto_clock_out_execution_log (
organization_id,
executed_at,
entries_processed,
entry_ids,
technician_ids,
technician_names,
total_points_deducted,
admin_notified,
admin_notification_ids,
success,
execution_duration_ms
) VALUES (
v_org_id,
v_execution_start,
v_affected_count,
COALESCE(v_entry_ids,        '{}'),
COALESCE(v_tech_ids,         '{}'),
COALESCE(v_tech_names,       '{}'),
COALESCE(v_total_points,     0),
COALESCE(array_length(v_admin_ids, 1), 0) > 0,
COALESCE(v_notification_ids, '{}'),
true,
v_execution_duration
)
RETURNING id INTO v_execution_log_id;

UPDATE company_settings SET last_auto_clock_out_run = v_execution_start WHERE organization_id=v_org_id;

RETURN jsonb_build_object(
'success',               true,
'execution_log_id',      v_execution_log_id,
'entries_processed',     v_affected_count,
'job_entries_closed',    v_job_entries_count,
'technician_ids',        v_tech_ids,
'technician_names',      v_tech_names,
'total_points_deducted', v_total_points,
'admin_notified',        COALESCE(array_length(v_admin_ids, 1), 0) > 0,
'notification_count',    COALESCE(array_length(v_notification_ids, 1), 0),
'executed_at',           v_execution_start,
'execution_duration_ms', v_execution_duration,
'cutoff_time',           v_cutoff_time::text,
'default_clock_out_time', v_default_clock_out_time::text,
'timezone',              v_timezone
);

EXCEPTION WHEN OTHERS THEN
BEGIN
INSERT INTO auto_clock_out_execution_log (
organization_id,
executed_at,
entries_processed,
entry_ids,
technician_ids,
technician_names,
success,
error_message
) VALUES (
COALESCE(v_org_id, (SELECT id FROM organizations LIMIT 1)),
v_execution_start,
0, '{}', '{}', '{}',
false,
SQLERRM
);
EXCEPTION WHEN OTHERS THEN
NULL;
END;

RETURN jsonb_build_object(
'success',           false,
'message',           'Error: ' || SQLERRM,
'entries_processed', 0
);
END;
$function$;
REVOKE ALL ON FUNCTION public.auto_clock_out_forgotten_entries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auto_clock_out_forgotten_entries() TO service_role;


-- Admin's single-entry clock-out uses the same authoritative ledger as the job.
CREATE OR REPLACE FUNCTION public.admin_forgotten_clock_out(p_entry_id uuid,p_clock_out timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); e public.daily_clock_entries; penalty integer; reset_at timestamptz;
BEGIN
 IF NOT time_private.can_manage_time(org) THEN RAISE EXCEPTION 'Time management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.daily_clock_entries WHERE id=p_entry_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Clock entry not found'; END IF;
 IF e.clock_out IS NOT NULL OR e.status<>'clocked_in' THEN RETURN; END IF;
 IF p_clock_out IS NULL OR p_clock_out<=e.clock_in OR p_clock_out>now() THEN RAISE EXCEPTION 'Invalid clock-out time'; END IF;
 SELECT coalesce(forgot_clock_out_penalty_points,-15),rewards_reset_at INTO penalty,reset_at FROM public.company_settings WHERE organization_id=org LIMIT 1;
 penalty:=coalesce(penalty,-15);
 IF penalty>0 THEN RAISE EXCEPTION 'Clock-out penalty must not be positive'; END IF;
 UPDATE public.daily_clock_entries SET clock_out=p_clock_out,status='clocked_out',total_hours=extract(epoch FROM(p_clock_out-e.clock_in))/3600,admin_adjusted=true,adjustment_reason='Forgotten clock-out closed by administrator',auto_clocked_out=true,auto_clocked_out_at=now(),auto_clock_out_approved=true,deduct_points=false,points_deducted=CASE WHEN reset_at IS NOT NULL AND e.clock_in<reset_at THEN 0 ELSE penalty END WHERE id=e.id;
 IF reset_at IS NULL OR e.clock_in>=reset_at THEN
  PERFORM private.post_reward_points(org,e.technician_id,penalty,'admin_adjustment',e.id,'Forgotten clock-out closed by administrator','forgotten_entry:'||e.id);
 END IF;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id) VALUES(org,e.technician_id,'system','Forgotten clock-out closed','An administrator closed your forgotten clock-out. See Rewards history for any points deduction.',e.id);
END $$;
REVOKE ALL ON FUNCTION public.admin_forgotten_clock_out(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_forgotten_clock_out(uuid,timestamptz) TO authenticated;
-- FK cascade deletion would erase redemption history; archive catalog items instead.
REVOKE DELETE,TRUNCATE ON public.rewards_catalog FROM PUBLIC,anon,authenticated;
