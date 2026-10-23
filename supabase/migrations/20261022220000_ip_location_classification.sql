-- Location labels are administrator-supplied, not inferred from IP geolocation.
ALTER TABLE public.ip_nicknames
  ADD COLUMN IF NOT EXISTS location_classification text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.ip_nicknames
  ADD CONSTRAINT ip_nicknames_location_classification_check
  CHECK (location_classification IN ('office', 'remote', 'unknown'));
COMMENT ON COLUMN public.ip_nicknames.location_classification IS 'Manual network label only; does not establish employee physical presence.';

-- Every employee in the same organization may read network labels, but only
-- organization administrators may create or reclassify office/remote IPs.
DROP POLICY IF EXISTS ip_nicknames_insert_same_org ON public.ip_nicknames;
DROP POLICY IF EXISTS ip_nicknames_update_same_org ON public.ip_nicknames;
DROP POLICY IF EXISTS ip_nicknames_delete_same_org ON public.ip_nicknames;

CREATE POLICY ip_nicknames_admin_insert ON public.ip_nicknames
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = (SELECT public.get_user_org_id())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = ip_nicknames.organization_id
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY ip_nicknames_admin_update ON public.ip_nicknames
FOR UPDATE TO authenticated
USING (
  organization_id = (SELECT public.get_user_org_id())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = ip_nicknames.organization_id
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  organization_id = (SELECT public.get_user_org_id())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = ip_nicknames.organization_id
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY ip_nicknames_admin_delete ON public.ip_nicknames
FOR DELETE TO authenticated
USING (
  organization_id = (SELECT public.get_user_org_id())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.organization_id = ip_nicknames.organization_id
      AND p.role IN ('admin', 'superadmin')
  )
);
