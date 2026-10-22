-- Company templates are administrator-owned. Personal templates remain private
-- to their creator; a proposal-specific resolver preserves customer rendering.
ALTER TABLE public.proposal_report_templates ADD COLUMN IF NOT EXISTS show_installed_price boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS show_item_color boolean NOT NULL DEFAULT false;
ALTER TABLE public.proposal_report_templates ENABLE ROW LEVEL SECURITY;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE OR REPLACE FUNCTION private.proposal_template_actor_org(p_admin boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role NOT IN ('portal_user','customer');
 IF NOT FOUND OR (p_admin AND p.role NOT IN ('admin','owner','super_admin')) THEN RAISE EXCEPTION 'Template administrator or employee access required' USING ERRCODE='42501'; END IF;
 RETURN p.organization_id;
END $$;
REVOKE ALL ON FUNCTION private.proposal_template_actor_org(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.proposal_template_actor_org(boolean) TO authenticated;
CREATE OR REPLACE FUNCTION private.can_manage_company_templates() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role IN ('admin','owner','super_admin'));
$$;
REVOKE ALL ON FUNCTION private.can_manage_company_templates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_company_templates() TO authenticated;
CREATE OR REPLACE FUNCTION private.can_read_staff_templates() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role NOT IN ('portal_user','customer'));
$$;
REVOKE ALL ON FUNCTION private.can_read_staff_templates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_staff_templates() TO authenticated;
-- Preserve old portal readers during rollout, scoped to templates actually sent
-- to this customer; this does not expose a staff member's other private templates.
CREATE OR REPLACE FUNCTION private.customer_can_read_sent_template(p_template uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=auth.uid() AND u.is_active IS TRUE AND u.organization_id=p_org AND u.role IN ('portal_user','customer'))
 AND EXISTS(SELECT 1 FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p_org WHERE p.organization_id=p_org AND c.portal_user_id=auth.uid() AND (p.report_template_id=p_template OR EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.proposal_id=p.id AND so.organization_id=p_org AND so.portal_template_override_id=p_template)));
$$;
REVOKE ALL ON FUNCTION private.customer_can_read_sent_template(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.customer_can_read_sent_template(uuid,uuid) TO authenticated;
DO $$DECLARE p record;BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='proposal_report_templates' LOOP EXECUTE format('DROP POLICY %I ON public.proposal_report_templates',p.policyname);END LOOP;
END$$;
CREATE POLICY template_read ON public.proposal_report_templates FOR SELECT TO authenticated USING(organization_id=public.get_user_org_id() AND ((private.can_read_staff_templates() AND (NOT is_personal OR created_by=auth.uid())) OR private.customer_can_read_sent_template(id,organization_id)));
CREATE POLICY template_insert ON public.proposal_report_templates FOR INSERT TO authenticated WITH CHECK(organization_id=public.get_user_org_id() AND private.can_read_staff_templates() AND created_by=auth.uid() AND ((is_personal AND NOT is_default) OR (NOT is_personal AND private.can_manage_company_templates())));
CREATE POLICY template_update ON public.proposal_report_templates FOR UPDATE TO authenticated USING(organization_id=public.get_user_org_id() AND private.can_read_staff_templates() AND ((is_personal AND created_by=auth.uid()) OR (NOT is_personal AND private.can_manage_company_templates()))) WITH CHECK(organization_id=public.get_user_org_id() AND ((is_personal AND created_by=auth.uid() AND NOT is_default) OR (NOT is_personal AND private.can_manage_company_templates())));
CREATE POLICY template_delete ON public.proposal_report_templates FOR DELETE TO authenticated USING(organization_id=public.get_user_org_id() AND private.can_read_staff_templates() AND ((is_personal AND created_by=auth.uid()) OR (NOT is_personal AND private.can_manage_company_templates())));
REVOKE ALL ON public.proposal_report_templates FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.proposal_report_templates TO authenticated;
CREATE OR REPLACE FUNCTION private.guard_proposal_template_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.is_personal IS DISTINCT FROM OLD.is_personal) THEN RAISE EXCEPTION 'Template ownership and scope are immutable'; END IF;
 IF TG_OP='INSERT' AND NEW.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_settings WHERE id=NEW.company_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Template company organization mismatch'; END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.guard_proposal_template_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_proposal_template_identity BEFORE INSERT OR UPDATE ON public.proposal_report_templates FOR EACH ROW EXECUTE FUNCTION private.guard_proposal_template_identity();
ALTER TABLE public.proposal_report_templates ADD CONSTRAINT personal_template_not_company_default CHECK(NOT(is_personal AND is_default));
CREATE UNIQUE INDEX one_company_proposal_template_default ON public.proposal_report_templates(organization_id) WHERE is_default AND NOT is_personal;
CREATE OR REPLACE FUNCTION public.set_company_proposal_template_default(p_template_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid:=private.proposal_template_actor_org(true);
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
 PERFORM 1 FROM public.proposal_report_templates WHERE id=p_template_id AND organization_id=org AND NOT is_personal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company template not found';END IF;
 UPDATE public.proposal_report_templates SET is_default=false WHERE organization_id=org AND is_default AND NOT is_personal;
 UPDATE public.proposal_report_templates SET is_default=true WHERE id=p_template_id AND organization_id=org;
END$$;
REVOKE ALL ON FUNCTION public.set_company_proposal_template_default(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_company_proposal_template_default(uuid) TO authenticated;

-- Direct assignment cannot be used to borrow somebody else's private template.
CREATE OR REPLACE FUNCTION private.guard_proposal_template_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE tid uuid; prior uuid; n jsonb:=to_jsonb(NEW); o jsonb;
BEGIN
 IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW;END IF;
 tid:=CASE WHEN TG_TABLE_NAME='proposals' THEN (n->>'report_template_id')::uuid ELSE (n->>'portal_template_override_id')::uuid END;
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD);prior:=CASE WHEN TG_TABLE_NAME='proposals' THEN (o->>'report_template_id')::uuid ELSE (o->>'portal_template_override_id')::uuid END;IF tid IS NOT DISTINCT FROM prior THEN RETURN NEW;END IF; END IF;
 IF tid IS NULL AND TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF private.proposal_template_actor_org() IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Template organization mismatch';END IF;
 IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proposal_report_templates WHERE id=tid AND organization_id=NEW.organization_id AND (NOT is_personal OR created_by=auth.uid())) THEN RAISE EXCEPTION 'Template access required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.guard_proposal_template_assignment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_proposal_template_assignment BEFORE INSERT OR UPDATE OF report_template_id ON public.proposals FOR EACH ROW EXECUTE FUNCTION private.guard_proposal_template_assignment();
CREATE TRIGGER guard_proposal_template_assignment BEFORE INSERT OR UPDATE OF portal_template_override_id ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION private.guard_proposal_template_assignment();

-- Do not make all personal templates readable merely to render one sent proposal.
CREATE OR REPLACE FUNCTION public.get_proposal_display_template(p_proposal_id uuid,p_template_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.profiles; p public.proposals; t public.proposal_report_templates; tid uuid; staff boolean; selected boolean;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND organization_id IS NOT NULL AND role IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.proposals WHERE id=p_proposal_id AND organization_id=actor.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal access required' USING ERRCODE='42501';END IF;
 staff:=actor.role NOT IN ('portal_user','customer');
 IF NOT staff AND NOT EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=p.contact_id AND c.organization_id=actor.organization_id AND c.portal_user_id=auth.uid()) THEN RAISE EXCEPTION 'Proposal customer access required' USING ERRCODE='42501';END IF;
 tid:=coalesce(p_template_id,p.report_template_id);
 IF tid IS NULL THEN SELECT id INTO tid FROM public.proposal_report_templates WHERE organization_id=actor.organization_id AND is_default AND NOT is_personal LIMIT 1; END IF;
 IF tid IS NULL THEN RETURN jsonb_build_object('template',NULL,'can_customize',staff); END IF;
 SELECT * INTO t FROM public.proposal_report_templates WHERE id=tid AND organization_id=actor.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
 selected:=t.id=p.report_template_id OR EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.proposal_id=p.id AND so.organization_id=actor.organization_id AND so.portal_template_override_id=t.id) OR (p.report_template_id IS NULL AND t.is_default AND NOT t.is_personal);
 IF (NOT staff AND NOT coalesce(selected,false)) OR (staff AND t.is_personal AND t.created_by IS DISTINCT FROM auth.uid() AND NOT coalesce(selected,false)) THEN RAISE EXCEPTION 'Template access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('template',to_jsonb(t)-'created_by'-'company_id'-'organization_id','can_customize',staff);
END$$;
REVOKE ALL ON FUNCTION public.get_proposal_display_template(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_display_template(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Keep the customer binding used above from being rewritten by a portal client.
-- Status decisions and ordinary contact edits remain available through existing flows.
CREATE OR REPLACE FUNCTION private.guard_customer_document_ownership() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb;
BEGIN
 IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  o:=to_jsonb(OLD);
  IF n->'id' IS NOT DISTINCT FROM o->'id' AND n->'organization_id' IS NOT DISTINCT FROM o->'organization_id' AND n->'contact_id' IS NOT DISTINCT FROM o->'contact_id' AND n->'proposal_id' IS NOT DISTINCT FROM o->'proposal_id' AND n->'portal_user_id' IS NOT DISTINCT FROM o->'portal_user_id' THEN RETURN NEW;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE AND role NOT IN ('portal_user','customer') AND organization_id=(n->>'organization_id')::uuid) THEN RAISE EXCEPTION 'Customer document ownership requires staff authorization' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.guard_customer_document_ownership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_customer_document_ownership BEFORE INSERT OR UPDATE OF id,organization_id,portal_user_id ON public.contacts FOR EACH ROW EXECUTE FUNCTION private.guard_customer_document_ownership();
CREATE TRIGGER guard_customer_document_ownership BEFORE INSERT OR UPDATE OF id,organization_id,contact_id ON public.proposals FOR EACH ROW EXECUTE FUNCTION private.guard_customer_document_ownership();
CREATE TRIGGER guard_customer_document_ownership BEFORE INSERT OR UPDATE OF id,organization_id,contact_id,proposal_id ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION private.guard_customer_document_ownership();
