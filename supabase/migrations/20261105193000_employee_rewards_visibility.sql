-- Employee presentation is independent of action-point accrual.
-- Default hidden for all organizations, including Electronic Life.
ALTER TABLE public.employee_action_reward_settings
 ADD COLUMN IF NOT EXISTS employee_visible boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_employee_rewards_visibility()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
 v_org := private.rewards_actor_org();
 IF v_org IS NULL THEN RETURN false; END IF;
 RETURN coalesce((SELECT employee_visible FROM public.employee_action_reward_settings
                  WHERE organization_id = v_org), false);
END $$;
REVOKE ALL ON FUNCTION public.get_employee_rewards_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_rewards_visibility() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_employee_rewards_visibility(p_visible boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
 IF NOT private.is_rewards_admin() THEN
   RAISE EXCEPTION 'Rewards administrator required' USING ERRCODE = '42501';
 END IF;
 v_org := private.rewards_actor_org(true);
 IF v_org IS NULL THEN RAISE EXCEPTION 'Organization required' USING ERRCODE = '42501'; END IF;
 INSERT INTO public.employee_action_reward_settings (organization_id, enabled, employee_visible)
 VALUES (v_org, false, p_visible)
 ON CONFLICT (organization_id) DO UPDATE SET employee_visible = EXCLUDED.employee_visible,
 updated_at = now();
 RETURN p_visible;
END $$;
REVOKE ALL ON FUNCTION public.set_employee_rewards_visibility(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_rewards_visibility(boolean) TO authenticated;

-- Enforce the launch gate on both redemption RPC signatures (the single-argument
-- overload delegates to the two-argument version).
CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid,p_request_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.rewards_actor_org(); actor uuid:=auth.uid(); balance integer; r public.rewards_catalog; previous public.reward_redemptions; redemption uuid;
BEGIN
 IF NOT public.flow_has_module_access('rewards_dashboard') THEN RAISE EXCEPTION 'Rewards access required' USING ERRCODE='42501'; END IF;
 IF NOT private.is_rewards_admin() AND NOT public.get_employee_rewards_visibility() THEN
   RAISE EXCEPTION 'Employee rewards are not yet available' USING ERRCODE='42501';
 END IF;
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
