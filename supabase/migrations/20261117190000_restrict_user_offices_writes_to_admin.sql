-- Office membership is an authorization input for office-scoped reporting.
-- Only organization administrators may change it.
DROP POLICY IF EXISTS user_offices_insert_same_org ON public.user_offices;
DROP POLICY IF EXISTS user_offices_delete_same_org ON public.user_offices;
CREATE POLICY user_offices_insert_admin ON public.user_offices
FOR INSERT TO authenticated WITH CHECK (
  organization_id = public.get_user_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_offices.organization_id
      AND actor.role = 'admin')
  AND EXISTS (SELECT 1 FROM public.profiles target
    WHERE target.id = user_offices.user_id
      AND target.organization_id = user_offices.organization_id)
  AND EXISTS (SELECT 1 FROM public.company_offices office
    WHERE office.id = user_offices.office_id
      AND office.organization_id = user_offices.organization_id)
);
CREATE POLICY user_offices_delete_admin ON public.user_offices
FOR DELETE TO authenticated USING (
  organization_id = public.get_user_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid())
      AND actor.organization_id = user_offices.organization_id
      AND actor.role = 'admin')
);