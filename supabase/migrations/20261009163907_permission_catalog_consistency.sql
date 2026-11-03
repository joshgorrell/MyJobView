-- Preserve historical menu IDs and existing user exceptions. Permission saves are
-- transactional, tenant-scoped, and guarded by a revision rather than delete/insert.
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS permission_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION private.is_current_page_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_key IS NOT NULL AND p_key <> ALL(ARRAY[
 'preferences','by_office','proposal_messages_admin','company_settings',
 'user_management','role_permissions','menu_builder','offices','priority_management',
 'pay_types','integrations','department_access','unassigned_jobs','payments',
 'job_costing','reports','quickbooks','feature_suggestions']);
$$;

CREATE OR REPLACE FUNCTION private.permission_admin_for_org(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.organization_id=p_org AND p.is_active=true
 AND (p.role='admin' OR p.is_global_admin=true));
$$;

-- The old helper treated all managers as administrators, including privilege edits.
CREATE OR REPLACE FUNCTION public.caller_is_admin_profile()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.is_active=true AND (p.role='admin' OR p.is_global_admin=true));
$$;
REVOKE ALL ON FUNCTION public.caller_is_admin_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.caller_is_admin_profile() TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_permission_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old jsonb; v_new jsonb; v_org uuid; v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN
   IF current_setting('role',true) IN ('anon','authenticated')
      OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
     RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
   END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 v_old:=to_jsonb(OLD); v_new:=to_jsonb(NEW);
 v_org:=coalesce((v_new->>'organization_id')::uuid,(v_old->>'organization_id')::uuid);
 IF NOT private.permission_admin_for_org(v_org) THEN
   RAISE EXCEPTION 'Only an active administrator can change permissions in this organization' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND v_old->>'organization_id' IS DISTINCT FROM v_new->>'organization_id' THEN
   RAISE EXCEPTION 'Permission records cannot move between organizations' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='roles' THEN
   IF TG_OP='DELETE' AND (OLD.is_system_role OR EXISTS(SELECT 1 FROM public.profiles WHERE role_id=OLD.id)) THEN
     RAISE EXCEPTION 'System roles and roles assigned to users cannot be deleted' USING ERRCODE='23503';
   END IF;
   IF TG_OP='UPDATE' AND OLD.is_system_role AND
     (OLD.role_key IS DISTINCT FROM NEW.role_key OR OLD.is_system_role IS DISTINCT FROM NEW.is_system_role OR NOT NEW.is_active) THEN
     RAISE EXCEPTION 'System role identity and availability cannot change' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
   IF v_new ? 'role_id' AND NOT EXISTS(SELECT 1 FROM public.roles WHERE id=(v_new->>'role_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Role is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'module_id' AND NOT EXISTS(SELECT 1 FROM public.department_modules WHERE id=(v_new->>'module_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Page is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'department_id' AND NOT EXISTS(SELECT 1 FROM public.departments WHERE id=(v_new->>'department_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'Department is outside this organization' USING ERRCODE='42501';
   END IF;
   IF v_new ? 'user_id' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(v_new->>'user_id')::uuid AND organization_id=v_org) THEN
     RAISE EXCEPTION 'User is outside this organization' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['roles','departments','department_modules','role_department_access','role_module_access','user_permission_overrides','department_user_overrides'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS guard_permission_metadata ON public.%I',t);
   EXECUTE format('CREATE TRIGGER guard_permission_metadata BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_permission_metadata()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.bump_permission_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN UPDATE public.roles SET permission_revision=permission_revision+1 WHERE id=OLD.role_id; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.role_id IS DISTINCT FROM NEW.role_id) THEN
   UPDATE public.roles SET permission_revision=permission_revision+1 WHERE id=NEW.role_id;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bump_permission_revision ON public.role_module_access;
CREATE TRIGGER bump_permission_revision AFTER INSERT OR UPDATE OR DELETE ON public.role_module_access
 FOR EACH ROW EXECUTE FUNCTION private.bump_permission_revision();

CREATE OR REPLACE FUNCTION public.get_role_page_permissions(p_role_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.roles;
BEGIN
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id;
 IF NOT FOUND OR NOT private.permission_admin_for_org(v_role.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this role' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('revision',v_role.permission_revision,'modules',coalesce((SELECT jsonb_agg(jsonb_build_object('module_id',a.module_id,'has_access',a.has_access)) FROM public.role_module_access a WHERE a.role_id=p_role_id AND a.organization_id=v_role.organization_id),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.save_role_page_permissions(p_role_id uuid,p_expected_revision bigint,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.roles; item jsonb;
BEGIN
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id FOR UPDATE;
 IF NOT FOUND OR NOT private.permission_admin_for_org(v_role.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this role' USING ERRCODE='42501';
 END IF;
 IF v_role.role_key='admin' THEN RAISE EXCEPTION 'Administrator access is inherent; assign a limited role to restrict a user' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR v_role.permission_revision<>p_expected_revision THEN
   RAISE EXCEPTION 'Permissions changed in another session. Reload this role before saving' USING ERRCODE='40001';
 END IF;
 IF p_permissions IS NULL OR jsonb_typeof(p_permissions)<>'array' OR jsonb_array_length(p_permissions)>500 THEN
   RAISE EXCEPTION 'Invalid permission list' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_permissions) x GROUP BY x->>'module_key' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Duplicate page permissions' USING ERRCODE='22023';
 END IF;
 -- Validate the entire request before changing anything. Legacy rows are untouched.
 FOR item IN SELECT * FROM jsonb_array_elements(p_permissions) LOOP
   IF jsonb_typeof(item->'has_access') IS DISTINCT FROM 'boolean' OR item->>'module_key' IN ('settings','feature_suggestions') OR NOT EXISTS(
     SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
     WHERE m.organization_id=v_role.organization_id AND d.organization_id=v_role.organization_id
     AND m.is_active AND d.is_active AND m.module_key=item->>'module_key' AND private.is_current_page_key(m.module_key)) THEN
     RAISE EXCEPTION 'This page is inactive, unavailable or controlled by the system' USING ERRCODE='22023';
   END IF;
 END LOOP;
 INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT p_role_id,m.id,(permissions.value->>'has_access')::boolean,v_role.organization_id
 FROM jsonb_array_elements(p_permissions) permissions(value) JOIN public.department_modules m ON m.module_key=permissions.value->>'module_key'
 WHERE m.organization_id=v_role.organization_id AND m.is_active
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=excluded.has_access;
 -- Department access is a summary for existing consumers, not a second page gate.
 INSERT INTO public.role_department_access(role_id,department_id,has_access,organization_id)
 SELECT p_role_id,d.id,EXISTS(SELECT 1 FROM public.department_modules m JOIN public.role_module_access a ON a.module_id=m.id AND a.role_id=p_role_id
 WHERE m.department_id=d.id AND m.is_active AND private.is_current_page_key(m.module_key) AND a.has_access),v_role.organization_id
 FROM public.departments d WHERE d.organization_id=v_role.organization_id AND d.is_active
 ON CONFLICT(role_id,department_id) DO UPDATE SET has_access=excluded.has_access;
 RETURN public.get_role_page_permissions(p_role_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_user_page_permissions(p_user_id uuid,p_module_keys text[],p_has_access boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target public.profiles; k text;
BEGIN
 SELECT * INTO target FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT private.permission_admin_for_org(target.organization_id) THEN
   RAISE EXCEPTION 'Administrator access required for this user' USING ERRCODE='42501';
 END IF;
 IF target.role='admin' THEN RAISE EXCEPTION 'Assign a limited role to restrict administrator access' USING ERRCODE='42501'; END IF;
 IF p_module_keys IS NULL OR cardinality(p_module_keys)=0 OR cardinality(p_module_keys)>500 THEN
   RAISE EXCEPTION 'Choose at least one current page' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY p_module_keys LOOP
   IF k IN ('settings','feature_suggestions') OR (k='my_time_off' AND target.employment_classification IS DISTINCT FROM 'employee') OR NOT EXISTS(
     SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
     WHERE m.organization_id=target.organization_id AND d.organization_id=target.organization_id AND m.module_key=k AND m.is_active AND d.is_active AND private.is_current_page_key(k)) THEN
     RAISE EXCEPTION 'This page is unavailable for this user' USING ERRCODE='22023';
   END IF;
 END LOOP;
 IF p_has_access IS NULL THEN
   DELETE FROM public.user_permission_overrides a USING public.department_modules m
   WHERE a.user_id=p_user_id AND a.organization_id=target.organization_id AND a.module_id=m.id AND m.module_key=ANY(p_module_keys);
 ELSE
   INSERT INTO public.user_permission_overrides(user_id,module_id,override_type,organization_id,created_by)
   SELECT p_user_id,m.id,CASE WHEN p_has_access THEN 'grant' ELSE 'revoke' END,target.organization_id,auth.uid()
   FROM public.department_modules m WHERE m.organization_id=target.organization_id AND m.is_active AND m.module_key=ANY(p_module_keys)
   ON CONFLICT(user_id,module_id) DO UPDATE SET override_type=excluded.override_type;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_role_page_permissions(uuid),public.save_role_page_permissions(uuid,bigint,jsonb),public.set_user_page_permissions(uuid,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_role_page_permissions(uuid),public.save_role_page_permissions(uuid,bigint,jsonb),public.set_user_page_permissions(uuid,text[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_page(p_user_id uuid,p_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=p_user_id AND is_active=true;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_key IN ('preferences','feature_suggestions') THEN RETURN true; END IF;
 IF p_key='settings' THEN RETURN p.role='admin'; END IF;
 IF p_key='my_time_off' AND p.employment_classification IS DISTINCT FROM 'employee' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.department_modules m JOIN public.departments d ON d.id=m.department_id
   WHERE m.organization_id=p.organization_id AND d.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND d.is_active AND private.is_current_page_key(p_key)) THEN RETURN false; END IF;
 IF p.role='admin' THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.user_permission_overrides u JOIN public.department_modules m ON m.id=u.module_id
   WHERE u.user_id=p.id AND u.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND u.override_type='revoke') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.user_permission_overrides u JOIN public.department_modules m ON m.id=u.module_id
   WHERE u.user_id=p.id AND u.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND u.override_type='grant') THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.role_module_access a JOIN public.department_modules m ON m.id=a.module_id JOIN public.roles r ON r.id=a.role_id
   WHERE a.role_id=p.role_id AND r.is_active AND r.organization_id=p.organization_id AND a.organization_id=p.organization_id AND m.organization_id=p.organization_id AND m.module_key=p_key AND m.is_active AND a.has_access);
END $$;
REVOKE ALL ON FUNCTION private.can_access_page(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_product_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_org uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_org:=OLD.organization_id; ELSE v_org:=NEW.organization_id; END IF;
 IF auth.uid() IS NULL THEN
   IF current_setting('role',true) IN ('anon','authenticated') OR coalesce(current_setting('request.jwt.claim.role',true),'') IN ('anon','authenticated') THEN
     RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
   END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=v_org AND p.is_active AND (p.role='admin' OR p.can_edit_products=true))
   OR (TG_OP='UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN
   RAISE EXCEPTION 'Product editing permission required for this organization' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS guard_product_permission ON public.products;
CREATE TRIGGER guard_product_permission BEFORE INSERT OR UPDATE OR DELETE ON public.products
 FOR EACH ROW EXECUTE FUNCTION private.guard_product_permission();

-- Keep a private, non-API snapshot so role-default changes can be reviewed/reverted.
CREATE TABLE IF NOT EXISTS private.permission_cleanup_backup(
 migration text NOT NULL,entity text NOT NULL,entity_id uuid NOT NULL,previous_value jsonb NOT NULL,
 PRIMARY KEY(migration,entity,entity_id));
REVOKE ALL ON private.permission_cleanup_backup FROM PUBLIC,anon,authenticated;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','department_modules',id,to_jsonb(m) FROM public.department_modules m
 WHERE NOT private.is_current_page_key(m.module_key)
 ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','role_module_access',id,to_jsonb(a) FROM public.role_module_access a ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','user_permission_overrides',id,to_jsonb(o) FROM public.user_permission_overrides o ON CONFLICT DO NOTHING;
INSERT INTO private.permission_cleanup_backup
 SELECT 'permission_catalog_consistency','profiles',id,to_jsonb(p) FROM public.profiles p
 WHERE p.role IN ('sales','tech','finance','service_manager') ON CONFLICT DO NOTHING;

UPDATE public.department_modules SET is_active=false WHERE NOT private.is_current_page_key(module_key);
UPDATE public.department_modules SET display_name='Feedback' WHERE module_key='reviews';
UPDATE public.department_modules SET display_name='Flow: Customer Messages' WHERE module_key='messages';

-- Normalize role grants across invoice shortcuts; explicit individual revokes
-- already take precedence and are not changed by this migration.
WITH grants AS (
 SELECT a.role_id,bool_or(a.has_access) AS allowed FROM public.role_module_access a JOIN public.department_modules m ON m.id=a.module_id
 WHERE m.module_key='invoices' GROUP BY a.role_id
)
INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT r.id,m.id,g.allowed,r.organization_id FROM grants g JOIN public.roles r ON r.id=g.role_id
 JOIN public.department_modules m ON m.organization_id=r.organization_id AND m.module_key='invoices' AND m.is_active
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=excluded.has_access;

-- Internal Flow is needed by Technicians/Finance as well as existing sales roles.
INSERT INTO public.role_module_access(role_id,module_id,has_access,organization_id)
 SELECT r.id,m.id,true,r.organization_id FROM public.roles r JOIN public.department_modules m ON m.organization_id=r.organization_id AND m.module_key='feed' AND m.is_active
 WHERE r.is_active AND r.role_key IN ('tech','finance')
 ON CONFLICT(role_id,module_id) DO UPDATE SET has_access=true;

-- Preserve sales duties for service users already explicitly designated sales reps.
-- Existing per-user revokes/grants and their notes always survive.
INSERT INTO public.user_permission_overrides(user_id,module_id,override_type,organization_id,notes)
 SELECT p.id,m.id,'grant',p.organization_id,'Preserved designated sales duties during role cleanup'
 FROM public.profiles p JOIN public.roles r ON r.id=p.role_id AND r.role_key='service_manager'
 JOIN public.role_module_access a ON a.role_id=r.id AND a.has_access JOIN public.department_modules m ON m.id=a.module_id
 WHERE p.is_sales_rep AND p.is_active AND p.organization_id=m.organization_id
 AND m.module_key IN ('prospects','pipeline_board','leads','fishbowl','connections','proposals','sales_orders','design_queue','sales_dashboard','sales_activity','individual_dashboard')
 ON CONFLICT(user_id,module_id) DO NOTHING;
UPDATE public.role_module_access a SET has_access=false FROM public.roles r,public.department_modules m
 WHERE a.role_id=r.id AND a.module_id=m.id AND (
 (r.role_key='service_manager' AND m.module_key IN ('prospects','pipeline_board','leads','fishbowl','connections','proposals','sales_orders','design_queue','sales_dashboard','sales_activity','individual_dashboard','time_approval','payments'))
 OR (r.role_key='business_development' AND m.module_key IN ('proposals','sales_orders','design_queue','report_templates')));

UPDATE public.profiles SET can_edit_products=false WHERE role IN ('sales','tech') AND can_edit_products=true AND NOT coalesce(can_create_purchase_orders,false);
UPDATE public.profiles SET can_create_proposals=false WHERE role='finance' AND can_create_proposals=true;

-- A permission record is not itself product editing authority. Own proposals,
-- workflow records, private conversations and billing scope retain their existing
-- separate policies; this migration does not broaden any record-level read policy.
NOTIFY pgrst,'reload schema';

-- Page grants now determine the authority of the payroll entry points. Existing
-- actor identity, period status, readiness and organization checks remain intact.
CREATE OR REPLACE FUNCTION private.require_payroll_access(p_period uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.pay_periods pp JOIN public.profiles p ON p.organization_id=pp.organization_id
   WHERE pp.id=p_period AND p.id=auth.uid() AND p.is_active) OR NOT private.can_access_page(auth.uid(),'payroll') THEN
   RAISE EXCEPTION 'Payroll permission required for this organization' USING ERRCODE='42501';
 END IF;
END $$;
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('check_payroll_readiness','refresh_payroll_time','approve_payroll_period','reopen_pay_period') LOOP
   definition:=pg_get_functiondef(f.oid);
   IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected payroll function structure'; END IF;
   definition:=replace(definition,E'\nBEGIN\n',E'\nBEGIN\nPERFORM private.require_payroll_access(p_pay_period_id);\n');
   -- Replace the legacy role allowlist with the same capability check, including
   -- explicitly authorized custom roles and Finance.
   definition:=regexp_replace(definition,'role[[:space:]]+IN[[:space:]]*\([^)]*\)','private.can_access_page(auth.uid(),''payroll'')','g');
   EXECUTE definition;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.oid::regprocedure);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);
 END LOOP;
END $$;

-- Assigned/open team tasks remain available. Company-wide task browsing requires
-- its own flag. JSON extraction also supports older databases before the task
-- department-assignment migration without inventing an assignment column.
CREATE OR REPLACE FUNCTION private.can_access_task(p_task jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles; dept uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active=true AND role<>'portal_user';
 IF NOT FOUND OR p.organization_id IS DISTINCT FROM (p_task->>'organization_id')::uuid THEN RETURN false; END IF;
 IF p.role='admin' OR p.can_view_all_tasks OR p.id IN ((p_task->>'user_id')::uuid,(p_task->>'assigned_to')::uuid,(p_task->>'claimed_by')::uuid) THEN RETURN true; END IF;
 dept:=nullif(p_task->>'assigned_department_id','')::uuid;
 IF nullif(p_task->>'assigned_to','') IS NULL AND dept IS NULL THEN RETURN true; END IF;
 RETURN dept IS NOT NULL AND EXISTS(SELECT 1 FROM public.department_modules m WHERE m.department_id=dept AND m.organization_id=p.organization_id AND m.is_active AND private.can_access_page(p.id,m.module_key));
END $$;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.can_access_task(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_access_task(jsonb) TO authenticated;
DROP POLICY IF EXISTS tasks_respect_assignment_scope ON public.tasks;
CREATE POLICY tasks_respect_assignment_scope ON public.tasks AS RESTRICTIVE FOR ALL TO authenticated
 USING (private.can_access_task(to_jsonb(tasks))) WITH CHECK (private.can_access_task(to_jsonb(tasks)));

UPDATE public.profiles SET can_view_all_tasks=false,can_view_all_pipeline=false WHERE role IN ('sales','finance');

CREATE OR REPLACE FUNCTION private.can_manage_payroll_org(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active)
 AND private.can_access_page(auth.uid(),'payroll');
$$;
REVOKE ALL ON FUNCTION private.can_manage_payroll_org(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_payroll_org(uuid) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['pay_periods','payroll_time_segments','payroll_approvals','payroll_reconciliation_flags','payroll_corrections'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL THEN
     EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
     EXECUTE format('DROP POLICY IF EXISTS permission_payroll_scope ON public.%I',t);
     EXECUTE format('CREATE POLICY permission_payroll_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(private.can_manage_payroll_org(organization_id)) WITH CHECK(private.can_manage_payroll_org(organization_id))',t);
   END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';

-- Department task membership follows the effective page grants, including user
-- revokes, rather than the obsolete independent department switches.
CREATE OR REPLACE FUNCTION private.user_has_department_access(p_user_id uuid,p_department_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.departments d ON d.organization_id=p.organization_id
   WHERE p.id=p_user_id AND p.is_active AND d.id=p_department_id AND d.is_active
   AND EXISTS(SELECT 1 FROM public.department_modules m WHERE m.department_id=d.id AND m.is_active AND private.can_access_page(p.id,m.module_key)));
$$;
REVOKE ALL ON FUNCTION private.user_has_department_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.user_has_department_access(uuid,uuid) TO authenticated;

-- Security-definer task transitions must enforce the same tenant/active-user
-- scope as table RLS. Fail closed if the expected existing body has changed.
DO $$ DECLARE f record; definition text; marker text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('complete_task_atomic','reopen_task_atomic') LOOP
  definition:=pg_get_functiondef(f.oid);
  marker:='  SELECT (role = ''admin'') INTO v_is_admin';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected task transition function structure'; END IF;
  definition:=replace(definition,marker,E'  IF NOT private.can_access_task(to_jsonb(v_task)) THEN\n    RAISE EXCEPTION ''Task permission required for this organization'' USING ERRCODE=''42501'';\n  END IF;\n\n'||marker);
  EXECUTE definition;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_atomic_task_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (
  (OLD.status IS DISTINCT FROM NEW.status AND (OLD.status='completed' OR NEW.status='completed'))
  OR OLD.completed_by IS DISTINCT FROM NEW.completed_by) THEN
  RAISE EXCEPTION 'Use the atomic task transition functions';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_atomic_task_completion() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='completed_by') THEN
  DROP TRIGGER IF EXISTS trigger_enforce_atomic_task_completion ON public.tasks;
  CREATE TRIGGER trigger_enforce_atomic_task_completion BEFORE UPDATE OF status,completed_by ON public.tasks
   FOR EACH ROW EXECUTE FUNCTION public.enforce_atomic_task_completion();
 END IF;
END $$;

-- Review authority is a page capability. Employee/profile configuration remains
-- separately protected by its existing administrator privilege guards.
DO $$ DECLARE definition text; oid regprocedure; BEGIN
 IF to_regprocedure('time_private.can_manage_time(uuid)') IS NOT NULL THEN
  EXECUTE $body$CREATE OR REPLACE FUNCTION time_private.can_manage_time(p_org uuid)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
    SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active)
     AND (private.can_access_page(auth.uid(),'time_approval') OR private.can_access_page(auth.uid(),'payroll') OR private.can_access_page(auth.uid(),'dispatch_dashboard'));
   $function$;$body$;
 END IF;
 oid:=to_regprocedure('public.notify_approvers_of_time_request()');
 IF oid IS NOT NULL THEN
  definition:=pg_get_functiondef(oid);
  definition:=replace(definition,'role IN (''admin'',''manager'',''service_manager'',''office_manager'',''production_manager'',''sales_manager'')',
    '(private.can_access_page(id,''time_approval'') OR private.can_access_page(id,''payroll'') OR private.can_access_page(id,''dispatch_dashboard''))');
  EXECUTE definition;
 END IF;
END $$;
ALTER TABLE private.permission_cleanup_backup ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst,'reload schema';

