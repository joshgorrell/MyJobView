-- Dealer-managed labels preserve existing canonical workflow and billing values.
CREATE TABLE public.work_order_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 kind text NOT NULL CHECK(kind IN ('type','status')), label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 80),
 behavior text NOT NULL, color text NOT NULL DEFAULT '#2563eb' CHECK(color ~ '^#[0-9A-Fa-f]{6}$'),
 sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, system_key text,
 UNIQUE(organization_id,kind,system_key), UNIQUE(id,organization_id),
 CHECK((kind='type' AND behavior IN ('project','service','site_survey','warranty','punchlist','vip_program')) OR
       (kind='status' AND behavior IN ('pending','assigned','in_progress','completed','on_hold','cancelled')))
);
CREATE UNIQUE INDEX work_order_option_labels ON public.work_order_options(organization_id,kind,lower(trim(label)));
ALTER TABLE public.work_order_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_options FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.work_order_options TO authenticated;
CREATE POLICY options_read ON public.work_order_options FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=work_order_options.organization_id AND p.is_active AND p.contact_id IS NULL));
CREATE POLICY options_admin ON public.work_order_options FOR ALL TO authenticated USING(
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=work_order_options.organization_id AND p.is_active AND p.contact_id IS NULL AND p.role='admin')) WITH CHECK(
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=work_order_options.organization_id AND p.is_active AND p.contact_id IS NULL AND p.role='admin'));
ALTER TABLE public.work_orders ADD COLUMN work_order_type_id uuid REFERENCES public.work_order_options(id) ON DELETE RESTRICT;
ALTER TABLE public.work_orders ADD COLUMN work_order_status_id uuid REFERENCES public.work_order_options(id) ON DELETE RESTRICT;
CREATE INDEX ON public.work_orders(work_order_type_id);
CREATE INDEX ON public.work_orders(work_order_status_id);
CREATE OR REPLACE FUNCTION public.seed_work_order_options(p_org uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 INSERT INTO work_order_options(organization_id,kind,label,behavior,system_key,sort_order)
 SELECT p_org,v.kind,v.label,v.behavior,v.key,v.position FROM (VALUES
 ('type','Project','project','project',0),('type','Service','service','service',1),('type','Warranty','warranty','warranty',2),
 ('type','Site Survey','site_survey','site_survey',3),('type','Test & Tune','project','test_and_tune',4),
 ('type','VIP Maintenance','vip_program','vip_program',5),('type','Punchlist (legacy)','punchlist','punchlist',6),
 ('status','Pending','pending','pending',0),('status','Scheduled','assigned','assigned',1),('status','In Process','in_progress','in_progress',2),
 ('status','Complete','completed','completed',3),('status','On Hold','on_hold','on_hold',4),('status','Cancelled','cancelled','cancelled',5)
 ) AS v(kind,label,behavior,key,position) ON CONFLICT(organization_id,kind,system_key) DO NOTHING;
 UPDATE work_order_options SET is_active=false WHERE organization_id=p_org AND system_key='punchlist' AND kind='type';
$$;
REVOKE ALL ON FUNCTION public.seed_work_order_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.seed_work_order_options(uuid) TO authenticated;
SELECT public.seed_work_order_options(id) FROM public.organizations;
CREATE OR REPLACE FUNCTION public.guard_work_order_option() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.system_key IS NOT NULL THEN RAISE EXCEPTION 'Built-in options can be deactivated, not deleted'; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.kind<>OLD.kind OR NEW.system_key IS DISTINCT FROM OLD.system_key OR NEW.behavior<>OLD.behavior) THEN
  RAISE EXCEPTION 'Option identity and behavior are immutable. Create another option instead';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER guard_work_order_option BEFORE UPDATE OR DELETE ON public.work_order_options FOR EACH ROW EXECUTE FUNCTION public.guard_work_order_option();
CREATE OR REPLACE FUNCTION public.resolve_work_order_options() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.work_order_options;
BEGIN
 -- Automatic workflow transitions retain canonical behavior and discard stale custom labels.
 IF TG_OP='UPDATE' THEN
  IF NEW.type<>OLD.type AND NEW.work_order_type_id IS NOT DISTINCT FROM OLD.work_order_type_id THEN NEW.work_order_type_id=NULL; END IF;
  IF NEW.status<>OLD.status AND NEW.work_order_status_id IS NOT DISTINCT FROM OLD.work_order_status_id THEN NEW.work_order_status_id=NULL; END IF;
 END IF;
 IF NEW.work_order_type_id IS NOT NULL THEN
  SELECT * INTO v FROM work_order_options WHERE id=NEW.work_order_type_id AND organization_id=NEW.company_id AND kind='type';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid work order type'; END IF;
  IF NOT v.is_active AND (TG_OP='INSERT' OR NEW.work_order_type_id IS DISTINCT FROM OLD.work_order_type_id) THEN RAISE EXCEPTION 'Work order type is inactive'; END IF;
  NEW.type=v.behavior;
  IF v.behavior='vip_program' AND NOT EXISTS(SELECT 1 FROM recurring_subscriptions rs JOIN recurring_plans rp ON rp.id=rs.plan_id WHERE rs.id=NEW.recurring_subscription_id AND rs.contact_id=NEW.contact_id AND rs.organization_id=NEW.company_id AND rs.status='active' AND rp.plan_type='vip_plan') THEN RAISE EXCEPTION 'VIP maintenance requires the customer’s active VIP plan'; END IF;
  IF v.system_key='test_and_tune' AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND organization_id=NEW.company_id AND substantial_completion_date IS NOT NULL AND CURRENT_DATE BETWEEN substantial_completion_date AND substantial_completion_date+90) AND (TG_OP='INSERT' OR NEW.work_order_type_id IS DISTINCT FROM OLD.work_order_type_id) THEN RAISE EXCEPTION 'Test & Tune requires a project in its 90-day period'; END IF;
 END IF;
 IF NEW.work_order_status_id IS NOT NULL THEN
  SELECT * INTO v FROM work_order_options WHERE id=NEW.work_order_status_id AND organization_id=NEW.company_id AND kind='status';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid work order status'; END IF;
  IF NOT v.is_active AND (TG_OP='INSERT' OR NEW.work_order_status_id IS DISTINCT FROM OLD.work_order_status_id) THEN RAISE EXCEPTION 'Work order status is inactive'; END IF;
  NEW.status=v.behavior;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resolve_work_order_options BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.resolve_work_order_options();
REVOKE ALL ON FUNCTION public.guard_work_order_option(),public.resolve_work_order_options() FROM PUBLIC,anon,authenticated;

-- Existing trial history is retained, with its original source identified explicitly.
ALTER TABLE public.recurring_subscriptions ADD COLUMN trial_source text NOT NULL DEFAULT 'vip_trial' CHECK(trial_source IN ('vip_trial','test_and_tune_legacy'));
UPDATE public.recurring_subscriptions SET trial_source='test_and_tune_legacy' WHERE notes LIKE 'Trial subscription created from punchlist invite%';
ALTER TABLE public.punchlist_access_grants DROP CONSTRAINT punchlist_access_grants_access_type_check;
ALTER TABLE public.punchlist_access_grants ADD CONSTRAINT punchlist_access_grants_access_type_check CHECK(access_type IN ('test_and_tune','promotional','vip_signup','vip_trial'));
CREATE OR REPLACE FUNCTION public.grant_customer_program(p_contact_id uuid,p_program text,p_project_id uuid DEFAULT NULL,p_days integer DEFAULT 90) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_role text; v_start date; v_end date; v_id uuid; v_subscription uuid;
BEGIN
 SELECT organization_id,role INTO v_org,v_role FROM profiles WHERE id=auth.uid() AND is_active AND contact_id IS NULL;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact_id AND organization_id=v_org) THEN RAISE EXCEPTION 'Contact not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text,0));
 IF p_program='test_and_tune' THEN
  SELECT substantial_completion_date INTO v_start FROM projects WHERE id=p_project_id AND contact_id=p_contact_id AND organization_id=v_org;
  IF v_start IS NULL THEN RAISE EXCEPTION 'Select a project with a substantial completion date'; END IF;
  v_end=v_start+90;
  IF v_end<CURRENT_DATE THEN RAISE EXCEPTION 'The project Test & Tune period has ended'; END IF;
  IF EXISTS(SELECT 1 FROM punchlist_access_grants WHERE project_id=p_project_id AND access_type='test_and_tune') THEN RAISE EXCEPTION 'This project already has Test & Tune access. Use its existing grant'; END IF;
 ELSIF p_program='vip_trial' THEN
  IF p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Trial duration must be 1 to 365 days'; END IF;
  IF EXISTS(SELECT 1 FROM recurring_subscriptions rs LEFT JOIN recurring_plans rp ON rp.id=rs.plan_id WHERE rs.contact_id=p_contact_id AND rs.organization_id=v_org AND ((rs.status='active' AND rp.plan_type='vip_plan') OR (rs.status='trial' AND rs.trial_source='vip_trial' AND rs.trial_end_date>=CURRENT_DATE))) THEN RAISE EXCEPTION 'Customer already has VIP membership or a VIP trial'; END IF;
  v_start=CURRENT_DATE; v_end=v_start+p_days;
  INSERT INTO recurring_subscriptions(company_id,organization_id,contact_id,status,start_date,next_billing_date,trial_started_date,trial_end_date,trial_source,auto_invoice,auto_send,auto_renew,created_by,notes)
  VALUES(v_org,v_org,p_contact_id,'trial',v_start,v_end,v_start,v_end,'vip_trial',false,false,false,auth.uid(),'Explicit promotional VIP trial; no automatic billing') RETURNING id INTO v_subscription;
 ELSE RAISE EXCEPTION 'Unknown customer program'; END IF;
 INSERT INTO punchlist_access_grants(organization_id,contact_id,project_id,subscription_id,access_type,status,granted_date,expiration_date)
 VALUES(v_org,p_contact_id,CASE WHEN p_program='test_and_tune' THEN p_project_id END,v_subscription,p_program,'active',v_start,v_end) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.grant_customer_program(uuid,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grant_customer_program(uuid,text,uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.send_punchlist_invite(p_invite_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v pending_punchlist_invites; v_id uuid;
BEGIN
 SELECT * INTO v FROM pending_punchlist_invites WHERE id=p_invite_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invite unavailable'; END IF;
 v_id=grant_customer_program(v.contact_id,'test_and_tune',v.project_id,90);
 DELETE FROM pending_punchlist_invites WHERE id=p_invite_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.send_punchlist_invite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) TO authenticated;
-- Access selection is scoped to the authenticated customer's own record or their dealer's staff.
CREATE OR REPLACE FUNCTION public.get_punchlist_access_info(p_contact_id uuid)
 RETURNS TABLE(has_access boolean,access_type text,days_remaining integer,expiration_date date,subscription_plan_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_contact uuid; v_role text;
BEGIN
 SELECT organization_id,contact_id,role INTO v_org,v_contact,v_role FROM profiles WHERE id=auth.uid() AND is_active;
 IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact_id AND organization_id=v_org) OR
  (v_contact IS DISTINCT FROM p_contact_id AND (v_contact IS NOT NULL OR v_role IN ('customer','portal','client'))) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 RETURN QUERY
 SELECT true,'vip_membership'::text,NULL::integer,NULL::date,rp.plan_name
 FROM recurring_subscriptions rs LEFT JOIN recurring_plans rp ON rp.id=rs.plan_id
 WHERE rs.contact_id=p_contact_id AND rs.organization_id=v_org AND rs.status='active' AND rp.plan_type='vip_plan'
 AND (rs.end_date IS NULL OR rs.end_date>=CURRENT_DATE) AND rs.next_billing_date>=CURRENT_DATE LIMIT 1;
 IF FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT true,pag.access_type,
 CASE WHEN pag.expiration_date IS NULL THEN NULL ELSE pag.expiration_date-CURRENT_DATE END,pag.expiration_date,rp.plan_name
 FROM punchlist_access_grants pag LEFT JOIN recurring_subscriptions rs ON rs.id=pag.subscription_id LEFT JOIN recurring_plans rp ON rp.id=rs.plan_id
 WHERE pag.contact_id=p_contact_id AND pag.organization_id=v_org AND pag.status='active' AND (pag.expiration_date IS NULL OR pag.expiration_date>=CURRENT_DATE)
 AND (pag.access_type<>'vip_trial' OR (rs.status IN ('trial','active') AND rs.trial_source='vip_trial' AND rs.trial_end_date>=CURRENT_DATE))
 ORDER BY CASE pag.access_type WHEN 'vip_trial' THEN 0 WHEN 'test_and_tune' THEN 1 ELSE 2 END,pag.expiration_date DESC NULLS FIRST LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.get_punchlist_access_info(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_all_punchlist_customers()
 RETURNS TABLE(contact_id uuid, contact_name text, contact_email text, contact_phone text, access_type text, status text, days_remaining integer, project_name text, subscription_plan_name text, expiration_date timestamp with time zone, granted_date timestamp with time zone, grant_id uuid)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
WITH vip_access AS (
SELECT DISTINCT
c.id                           AS contact_id,
c.full_name                    AS contact_name,
c.email                        AS contact_email,
c.phone                        AS contact_phone,
CASE WHEN s.status='trial' THEN 'vip_trial' ELSE 'vip_membership' END::text AS access_type,
s.status::text                 AS status,
NULL::int                      AS days_remaining,
NULL::text                     AS project_name,
rp.plan_name                   AS subscription_plan_name,
NULL::timestamptz              AS expiration_date,
s.start_date::timestamptz      AS granted_date,
NULL::uuid                     AS grant_id
FROM contacts c
INNER JOIN recurring_subscriptions s ON s.contact_id = c.id
INNER JOIN recurring_plans rp        ON rp.id = s.plan_id
WHERE rp.plan_type='vip_plan' AND (s.status='active' OR (s.status='trial' AND s.trial_source='vip_trial' AND s.trial_end_date>=CURRENT_DATE))
),
grant_access AS (
SELECT
c.id                       AS contact_id,
c.full_name                AS contact_name,
c.email                    AS contact_email,
c.phone                    AS contact_phone,
pag.access_type,
CASE
WHEN pag.access_type='vip_trial' AND NOT EXISTS(SELECT 1 FROM recurring_subscriptions trial WHERE trial.id=pag.subscription_id AND trial.status IN ('trial','active') AND trial.trial_end_date>=CURRENT_DATE) THEN 'expired'
WHEN pag.status = 'suspended' THEN 'suspended'
WHEN pag.expiration_date IS NULL THEN 'active'
WHEN pag.expiration_date > NOW() THEN 'active'
ELSE 'expired'
END::text                  AS status,
CASE
WHEN pag.expiration_date IS NULL THEN NULL
WHEN pag.expiration_date <= NOW() THEN 0
ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (pag.expiration_date - NOW())) / 86400))::int
END                        AS days_remaining,
p.name                     AS project_name,
NULL::text                 AS subscription_plan_name,
pag.expiration_date::timestamptz,
pag.granted_date::timestamptz,
pag.id                     AS grant_id
FROM contacts c
INNER JOIN punchlist_access_grants pag ON pag.contact_id = c.id
LEFT  JOIN projects p ON p.id = pag.project_id
WHERE pag.access_type IN ('test_and_tune', 'promotional', 'vip_signup', 'vip_trial')
),
all_access AS (
SELECT * FROM vip_access
UNION ALL
SELECT * FROM grant_access
)
SELECT DISTINCT ON (a.contact_id)
a.contact_id,
a.contact_name,
a.contact_email,
a.contact_phone,
a.access_type,
a.status,
a.days_remaining,
a.project_name,
a.subscription_plan_name,
a.expiration_date,
a.granted_date,
a.grant_id
FROM all_access a
ORDER BY
a.contact_id,
CASE a.access_type
WHEN 'vip_membership' THEN 1
WHEN 'vip_trial'      THEN 2
WHEN 'vip_signup'     THEN 5
WHEN 'test_and_tune'  THEN 3
WHEN 'promotional'    THEN 4
ELSE 5
END,
CASE a.status
WHEN 'active'     THEN 1
WHEN 'trial'      THEN 1
WHEN 'suspended'  THEN 2
WHEN 'expired'    THEN 3
ELSE 4
END,
a.granted_date DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_all_punchlist_customers() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_all_punchlist_customers() TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_vip_trial_grant() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.trial_source='vip_trial' AND NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date THEN
  UPDATE punchlist_access_grants SET expiration_date=NEW.trial_end_date
  WHERE subscription_id=NEW.id AND organization_id=NEW.organization_id AND access_type='vip_trial';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_vip_trial_grant AFTER UPDATE OF trial_end_date ON public.recurring_subscriptions FOR EACH ROW EXECUTE FUNCTION public.sync_vip_trial_grant();
REVOKE ALL ON FUNCTION public.sync_vip_trial_grant() FROM PUBLIC,anon,authenticated;
-- All enrollment paths share project dates; an invitation cannot restart the clock.
CREATE OR REPLACE FUNCTION public.normalize_test_tune_grant() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_start date;
BEGIN
 IF NEW.access_type='test_and_tune' THEN
  SELECT substantial_completion_date INTO v_start FROM projects WHERE id=NEW.project_id AND contact_id=NEW.contact_id AND organization_id=NEW.organization_id;
  IF v_start IS NULL THEN RAISE EXCEPTION 'Test & Tune requires a substantially completed project'; END IF;
  IF v_start+90<CURRENT_DATE THEN RAISE EXCEPTION 'The project Test & Tune period has ended'; END IF;
  NEW.granted_date=v_start; NEW.expiration_date=v_start+90;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER normalize_test_tune_grant BEFORE INSERT ON public.punchlist_access_grants FOR EACH ROW EXECUTE FUNCTION public.normalize_test_tune_grant();
REVOKE ALL ON FUNCTION public.normalize_test_tune_grant() FROM PUBLIC,anon,authenticated;
