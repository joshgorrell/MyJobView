-- Restrict office visibility changes to administrators of the same organization.
-- Previously, INSERT and UPDATE were allowed to any member of that organization.
-- Existing SELECT behavior is intentionally unchanged.
DROP POLICY IF EXISTS user_visibility_settings_insert_same_org ON public.user_visibility_settings;
DROP POLICY IF EXISTS user_visibility_settings_update_same_org ON public.user_visibility_settings;

CREATE POLICY user_visibility_settings_insert_admin
ON public.user_visibility_settings FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_visibility_settings.organization_id
      AND actor.role = 'admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.id = user_visibility_settings.user_id
      AND target.organization_id = user_visibility_settings.organization_id
  )
);

CREATE POLICY user_visibility_settings_update_admin
ON public.user_visibility_settings FOR UPDATE TO authenticated
USING (
  organization_id = public.get_user_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_visibility_settings.organization_id
      AND actor.role = 'admin'
  )
)
WITH CHECK (
  organization_id = public.get_user_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_visibility_settings.organization_id
      AND actor.role = 'admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.id = user_visibility_settings.user_id
      AND target.organization_id = user_visibility_settings.organization_id
  )
);

-- Explicitly prevent unauthorized deletion as well.
DROP POLICY IF EXISTS user_visibility_settings_delete_admin ON public.user_visibility_settings;
CREATE POLICY user_visibility_settings_delete_admin
ON public.user_visibility_settings FOR DELETE TO authenticated
USING (
  organization_id = public.get_user_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_visibility_settings.organization_id
      AND actor.role = 'admin'
  )
);
