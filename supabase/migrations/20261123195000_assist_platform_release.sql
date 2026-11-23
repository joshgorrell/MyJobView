-- The platform opens dealer enrollment after the hosted guest flow is verified.
CREATE TABLE assist_private.platform_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enrollment_open boolean NOT NULL DEFAULT false
);
ALTER TABLE assist_private.platform_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.platform_release FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON assist_private.platform_release TO service_role;
CREATE POLICY assist_platform_release_service ON assist_private.platform_release TO service_role USING (true) WITH CHECK (true);
INSERT INTO assist_private.platform_release DEFAULT VALUES;

CREATE FUNCTION assist_private.enrollment_open()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT coalesce((SELECT enrollment_open FROM assist_private.platform_release WHERE singleton),false);
$$;
REVOKE ALL ON FUNCTION assist_private.enrollment_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assist_private.enrollment_open() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_assist_setup(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT assist_private.setup_status(p_organization_id)
  || jsonb_build_object('enrollment_open',assist_private.enrollment_open());
$$;

CREATE OR REPLACE FUNCTION assist_private.set_enabled(p_organization_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_organization_id);
BEGIN
 IF p_enabled IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN
  RAISE EXCEPTION 'Dealer administrator required' USING ERRCODE='42501';
 END IF;
 IF p_enabled AND NOT assist_private.enrollment_open() AND NOT EXISTS(
  SELECT 1 FROM assist_private.dealer_preferences WHERE organization_id=org AND enabled
 ) THEN
  RAISE EXCEPTION 'Remote Support enrollment is unavailable' USING ERRCODE='55000';
 END IF;
 INSERT INTO assist_private.dealer_preferences(organization_id,enabled) VALUES(org,p_enabled)
 ON CONFLICT(organization_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now();
 RETURN public.get_assist_setup(org);
END $$;
