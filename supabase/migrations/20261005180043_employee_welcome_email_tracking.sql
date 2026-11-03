-- Provider acceptance is recorded as sent, not delivered. No token or password is stored.
CREATE TABLE public.user_account_email_status (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  welcome_attempted_at timestamptz,
  welcome_sent_at timestamptz,
  welcome_email_id text,
  welcome_error text,
  reset_attempted_at timestamptz,
  reset_sent_at timestamptz,
  reset_email_id text,
  reset_error text,
  activated_at timestamptz
);
ALTER TABLE public.user_account_email_status ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_account_email_status TO authenticated;
GRANT ALL ON public.user_account_email_status TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.user_account_email_status FROM authenticated, anon;
CREATE POLICY account_email_admin_read ON public.user_account_email_status
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles actor JOIN public.profiles target
    ON actor.organization_id = target.organization_id
  WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'admin' AND actor.is_active
    AND target.id = user_account_email_status.user_id
));
-- Auth owns password changes; activation cannot be self-asserted by editing a profile.
CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.record_account_password_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.user_account_email_status SET activated_at = COALESCE(activated_at, now())
    WHERE user_id = NEW.id AND welcome_sent_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_account_password_setup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_account_password_setup AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.record_account_password_setup();
