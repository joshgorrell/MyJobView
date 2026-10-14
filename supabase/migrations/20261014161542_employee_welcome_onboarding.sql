-- Eligible only after a welcomed employee changes their password. Completion
-- is durable across browsers and resets; clients cannot create eligible rows.
CREATE TABLE public.employee_welcome_onboarding (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  eligible_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  skipped boolean NOT NULL DEFAULT false
);
ALTER TABLE public.employee_welcome_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_welcome_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_welcome_onboarding TO authenticated;
GRANT UPDATE (completed_at, skipped) ON public.employee_welcome_onboarding TO authenticated;
GRANT ALL ON public.employee_welcome_onboarding TO service_role;
CREATE POLICY welcome_onboarding_read_own ON public.employee_welcome_onboarding
FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.is_active AND p.role <> 'portal_user'
  )
);
CREATE POLICY welcome_onboarding_complete_own ON public.employee_welcome_onboarding
FOR UPDATE TO authenticated USING (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND p.is_active AND p.role <> 'portal_user'
  )
) WITH CHECK (user_id = (SELECT auth.uid()) AND completed_at IS NOT NULL);

CREATE OR REPLACE FUNCTION private.record_account_password_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.user_account_email_status SET activated_at = COALESCE(activated_at, now())
    WHERE user_id = NEW.id AND welcome_sent_at IS NOT NULL;
    INSERT INTO public.employee_welcome_onboarding(user_id, eligible_at)
      SELECT s.user_id, s.activated_at FROM public.user_account_email_status s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.user_id = NEW.id AND s.welcome_sent_at IS NOT NULL
        AND s.activated_at IS NOT NULL AND p.is_active AND p.role <> 'portal_user'
      ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_account_password_setup() FROM PUBLIC, anon, authenticated;

-- Previously activated welcome accounts have not had this onboarding yet.
INSERT INTO public.employee_welcome_onboarding(user_id, eligible_at)
  SELECT s.user_id, s.activated_at FROM public.user_account_email_status s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.welcome_sent_at IS NOT NULL AND s.activated_at IS NOT NULL
    AND p.is_active AND p.role <> 'portal_user'
  ON CONFLICT (user_id) DO NOTHING;

-- RLS remains in force. Whitelist the same six self-service notification
-- settings exposed by Preferences; no roles or access flags are accepted.
CREATE FUNCTION public.complete_employee_welcome_onboarding(
  p_avatar_url text DEFAULT NULL,
  p_preferences jsonb DEFAULT '{}'::jsonb,
  p_skip boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT completed_at INTO v_completed_at FROM public.employee_welcome_onboarding
    WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Welcome onboarding is not available for this account' USING ERRCODE = '42501'; END IF;
  IF v_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('completed_at', v_completed_at, 'avatar_url', (SELECT avatar_url FROM public.profiles WHERE id = v_user_id));
  END IF;
  IF NOT p_skip THEN
    IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
      RAISE EXCEPTION 'Notification preferences must be an object' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_preferences) e WHERE e.key NOT IN (
      'notify_on_mention','notify_on_lead_assigned','notify_on_fishbowl',
      'notify_on_escalated','notify_on_lead_status','notify_on_product_requests'
    ) OR jsonb_typeof(e.value) <> 'boolean') THEN
      RAISE EXCEPTION 'Only personal notification preferences are allowed' USING ERRCODE = '22023';
    END IF;
    IF p_avatar_url IS NOT NULL AND (length(p_avatar_url) > 2048 OR p_avatar_url !~ '^https://[^[:space:]]+$') THEN
      RAISE EXCEPTION 'Avatar must be a secure image URL' USING ERRCODE = '22023';
    END IF;
    UPDATE public.profiles SET avatar_url = p_avatar_url,
      notify_on_mention = COALESCE((p_preferences->>'notify_on_mention')::boolean, notify_on_mention),
      notify_on_lead_assigned = COALESCE((p_preferences->>'notify_on_lead_assigned')::boolean, notify_on_lead_assigned),
      notify_on_fishbowl = COALESCE((p_preferences->>'notify_on_fishbowl')::boolean, notify_on_fishbowl),
      notify_on_escalated = COALESCE((p_preferences->>'notify_on_escalated')::boolean, notify_on_escalated),
      notify_on_lead_status = COALESCE((p_preferences->>'notify_on_lead_status')::boolean, notify_on_lead_status),
      notify_on_product_requests = COALESCE((p_preferences->>'notify_on_product_requests')::boolean, notify_on_product_requests)
    WHERE id = v_user_id AND is_active AND role <> 'portal_user';
    IF NOT FOUND THEN RAISE EXCEPTION 'Active employee profile required' USING ERRCODE = '42501'; END IF;
    UPDATE public.business_cards SET photo_url = p_avatar_url, updated_at = now() WHERE user_id = v_user_id;
  END IF;
  v_completed_at := now();
  UPDATE public.employee_welcome_onboarding SET completed_at = v_completed_at, skipped = p_skip WHERE user_id = v_user_id;
  RETURN jsonb_build_object('completed_at', v_completed_at, 'avatar_url', (SELECT avatar_url FROM public.profiles WHERE id = v_user_id));
END;
$$;
REVOKE ALL ON FUNCTION public.complete_employee_welcome_onboarding(text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_employee_welcome_onboarding(text,jsonb,boolean) TO authenticated;
