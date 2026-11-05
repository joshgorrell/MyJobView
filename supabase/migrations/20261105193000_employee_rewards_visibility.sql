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
