-- F2/F3/F4: writes to the access-control tables and to the organization record\n-- must be made by an admin, not by any signed-in member of the organization.\n\n-- role_module_access\nDROP POLICY IF EXISTS role_module_access_insert_same_org ON public.role_module_access

\nDROP POLICY IF EXISTS role_module_access_delete_same_org ON public.role_module_access

\nDROP POLICY IF EXISTS role_module_access_update_same_org ON public.role_module_access

\n\nCREATE POLICY role_module_access_insert_admin ON public.role_module_access\n  FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\nCREATE POLICY role_module_access_update_admin ON public.role_module_access\n  FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND caller_is_admin_profile())\n  WITH CHECK (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\nCREATE POLICY role_module_access_delete_admin ON public.role_module_access\n  FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\n-- user_permission_overrides\nDROP POLICY IF EXISTS user_permission_overrides_insert_same_org ON public.user_permission_overrides

\nDROP POLICY IF EXISTS user_permission_overrides_update_same_org ON public.user_permission_overrides

\nDROP POLICY IF EXISTS user_permission_overrides_delete_same_org ON public.user_permission_overrides

\nDROP POLICY IF EXISTS user_permission_overrides_select_same_org ON public.user_permission_overrides

\n\nCREATE POLICY user_permission_overrides_select_own_or_admin ON public.user_permission_overrides\n  FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id() AND (user_id = auth.uid() OR caller_is_admin_profile()))

\n\nCREATE POLICY user_permission_overrides_insert_admin ON public.user_permission_overrides\n  FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\nCREATE POLICY user_permission_overrides_update_admin ON public.user_permission_overrides\n  FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND caller_is_admin_profile())\n  WITH CHECK (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\nCREATE POLICY user_permission_overrides_delete_admin ON public.user_permission_overrides\n  FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND caller_is_admin_profile())

\n\n-- organizations\nDROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations

\n\nCREATE POLICY "Admins can update their organization" ON public.organizations\n  FOR UPDATE TO authenticated\n  USING (id = get_user_org_id() AND caller_is_admin_profile())\n  WITH CHECK (id = get_user_org_id() AND caller_is_admin_profile())

\n
