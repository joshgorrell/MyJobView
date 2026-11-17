-- Independently selected visible offices; office membership remains unchanged.
CREATE TABLE IF NOT EXISTS public.user_visible_offices (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES public.company_offices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, office_id)
);
CREATE INDEX IF NOT EXISTS user_visible_offices_org_idx ON public.user_visible_offices(organization_id);
ALTER TABLE public.user_visible_offices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_visible_offices_select_same_org ON public.user_visible_offices;
DROP POLICY IF EXISTS user_visible_offices_insert_admin ON public.user_visible_offices;
DROP POLICY IF EXISTS user_visible_offices_delete_admin ON public.user_visible_offices;
CREATE POLICY user_visible_offices_select_same_org ON public.user_visible_offices
  FOR SELECT TO authenticated USING (organization_id = public.get_user_org_id());
CREATE POLICY user_visible_offices_insert_admin ON public.user_visible_offices
  FOR INSERT TO authenticated WITH CHECK (
    organization_id = public.get_user_org_id()
    AND EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'admin' AND actor.organization_id = user_visible_offices.organization_id)
    AND EXISTS (SELECT 1 FROM public.profiles target WHERE target.id = user_visible_offices.user_id AND target.organization_id = user_visible_offices.organization_id)
    AND EXISTS (SELECT 1 FROM public.company_offices office WHERE office.id = user_visible_offices.office_id AND office.organization_id = user_visible_offices.organization_id)
  );
CREATE POLICY user_visible_offices_delete_admin ON public.user_visible_offices
  FOR DELETE TO authenticated USING (
    organization_id = public.get_user_org_id()
    AND EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'admin' AND actor.organization_id = user_visible_offices.organization_id)
  );
-- Preserve currently configured selected-office visibility before switching the RPC.
INSERT INTO public.user_visible_offices(user_id,office_id,organization_id)
SELECT u.user_id,u.office_id,u.organization_id
FROM public.user_offices u JOIN public.user_visibility_settings v ON v.user_id=u.user_id AND v.organization_id=u.organization_id
WHERE v.visibility_scope='selected_offices'
ON CONFLICT DO NOTHING;

DO $patch$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_tech_production(date,date)'::regprocedure) INTO definition;
  IF position('FROM public.user_visible_offices a JOIN public.user_offices b ON b.office_id=a.office_id' IN definition)>0 THEN RETURN; END IF;
  IF position('FROM public.user_offices a JOIN public.user_offices b ON b.office_id=a.office_id WHERE a.user_id=auth.uid() AND b.user_id=p.id' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected Tech Stats office filter; refusing unsafe migration';
  END IF;
  definition := replace(definition,
    'FROM public.user_offices a JOIN public.user_offices b ON b.office_id=a.office_id WHERE a.user_id=auth.uid() AND b.user_id=p.id',
    'FROM public.user_visible_offices a JOIN public.user_offices b ON b.office_id=a.office_id WHERE a.user_id=auth.uid() AND b.user_id=p.id');
  EXECUTE definition;
END $patch$;
