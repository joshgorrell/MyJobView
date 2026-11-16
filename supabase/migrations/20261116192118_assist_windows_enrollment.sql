-- Enrollment only. This migration does not grant remote-control access or enable any dealer.
CREATE SCHEMA IF NOT EXISTS assist_private;
REVOKE ALL ON SCHEMA assist_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA assist_private TO authenticated, service_role;

CREATE TABLE assist_private.dealer_setup (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  server_origin text NOT NULL CHECK (server_origin ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](:[0-9]{1,5})?$'),
  mesh_domain text NOT NULL CHECK (mesh_domain ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  windows_download_url text NOT NULL,
  enrollment_enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  UNIQUE (server_origin, mesh_domain),
  CHECK (NOT enrollment_enabled OR verified_at IS NOT NULL),
  CHECK (starts_with(windows_download_url, server_origin || '/' || mesh_domain || '/meshagents?')),
  CHECK (windows_download_url !~ '[[:space:]#]' AND windows_download_url LIKE '%meshid=%'
    AND windows_download_url ~ '[?&]id=4(&|$)')
);
ALTER TABLE assist_private.dealer_setup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.dealer_setup FROM PUBLIC, anon, authenticated;
GRANT ALL ON assist_private.dealer_setup TO service_role;

-- Dealer preference also acts as a provisioning request; the platform worker is a later milestone.
CREATE TABLE assist_private.dealer_preferences (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assist_private.dealer_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.dealer_preferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON assist_private.dealer_preferences TO service_role;

-- This audit records issuance of an enrollment link, not installation or a support session.
CREATE TABLE assist_private.enrollment_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assist_enrollment_downloads_org_time ON assist_private.enrollment_downloads(organization_id, requested_at DESC);
ALTER TABLE assist_private.enrollment_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assist_private.enrollment_downloads FROM PUBLIC, anon, authenticated;
GRANT ALL ON assist_private.enrollment_downloads TO service_role;

CREATE FUNCTION assist_private.require_employee(p_organization_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid;
BEGIN
 SELECT p.organization_id INTO org FROM public.profiles p
 JOIN public.organizations o ON o.id=p.organization_id
 WHERE p.id=auth.uid() AND p.is_active AND p.role<>'portal_user' AND o.is_active;
 IF org IS NULL OR org IS DISTINCT FROM p_organization_id THEN
  RAISE EXCEPTION 'Active employee in this dealer required' USING ERRCODE='42501';
 END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION assist_private.require_employee(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION assist_private.setup_status(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_organization_id);
BEGIN
 RETURN jsonb_build_object('enabled', EXISTS(
  SELECT 1 FROM assist_private.dealer_preferences WHERE organization_id=org AND enabled
 ), 'provisioned', EXISTS(
  SELECT 1 FROM assist_private.dealer_setup WHERE organization_id=org AND verified_at IS NOT NULL
 ), 'windows_download_ready', EXISTS(
  SELECT 1 FROM assist_private.dealer_setup WHERE organization_id=org AND enrollment_enabled AND verified_at IS NOT NULL
 ) AND EXISTS(SELECT 1 FROM assist_private.dealer_preferences WHERE organization_id=org AND enabled));
END $$;
REVOKE ALL ON FUNCTION assist_private.setup_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assist_private.setup_status(uuid) TO authenticated;

CREATE FUNCTION assist_private.windows_download(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_organization_id); target text;
BEGIN
 PERFORM 1 FROM assist_private.dealer_preferences WHERE organization_id=org AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000'; END IF;
 -- Lock against concurrent disable while issuing. Future requests recheck configuration.
 SELECT windows_download_url INTO target FROM assist_private.dealer_setup
 WHERE organization_id=org AND enrollment_enabled AND verified_at IS NOT NULL FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000'; END IF;
 INSERT INTO assist_private.enrollment_downloads(organization_id,requested_by) VALUES(org,auth.uid());
 RETURN jsonb_build_object('url',target);
END $$;
REVOKE ALL ON FUNCTION assist_private.windows_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assist_private.windows_download(uuid) TO authenticated;

-- Public API wrappers run as caller; privileged implementations stay in an unexposed schema.
CREATE FUNCTION public.get_assist_setup(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT assist_private.setup_status(p_organization_id);
$$;
CREATE FUNCTION public.get_assist_windows_download(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT assist_private.windows_download(p_organization_id);
$$;
REVOKE ALL ON FUNCTION public.get_assist_setup(uuid), public.get_assist_windows_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assist_setup(uuid), public.get_assist_windows_download(uuid) TO authenticated;

CREATE FUNCTION assist_private.set_enabled(p_organization_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid:=assist_private.require_employee(p_organization_id);
BEGIN
 IF p_enabled IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN
  RAISE EXCEPTION 'Dealer administrator required' USING ERRCODE='42501';
 END IF;
 INSERT INTO assist_private.dealer_preferences(organization_id,enabled) VALUES(org,p_enabled)
 ON CONFLICT(organization_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now();
 RETURN assist_private.setup_status(org);
END $$;
REVOKE ALL ON FUNCTION assist_private.set_enabled(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assist_private.set_enabled(uuid,boolean) TO authenticated;
CREATE FUNCTION public.set_assist_enabled(p_organization_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT assist_private.set_enabled(p_organization_id,p_enabled);
$$;
REVOKE ALL ON FUNCTION public.set_assist_enabled(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_assist_enabled(uuid,boolean) TO authenticated;
