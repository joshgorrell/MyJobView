-- Existing API consumers must use the same rules as the editor/navigation. The
-- legacy helper referenced retired department_access/module_access tables.
CREATE OR REPLACE FUNCTION public.user_has_module_access(p_user_id uuid,p_module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles actor JOIN public.profiles target ON target.organization_id=actor.organization_id
  WHERE actor.id=auth.uid() AND actor.is_active AND target.id=p_user_id
   AND (actor.id=target.id OR actor.role='admin' OR actor.is_global_admin))
  AND private.can_access_page(p_user_id,p_module_key);
$$;
REVOKE ALL ON FUNCTION public.user_has_module_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.user_has_module_access(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
