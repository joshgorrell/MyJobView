-- A comp is a real VIP plan with an explicit term and no billing or renewal.
ALTER TABLE public.recurring_subscriptions
 ADD COLUMN IF NOT EXISTS comped_by uuid REFERENCES public.profiles(id),
 ADD COLUMN IF NOT EXISTS comped_at timestamptz,
 ADD COLUMN IF NOT EXISTS comp_reason text;
CREATE OR REPLACE FUNCTION public.grant_comped_vip_membership(
 p_contact_id uuid, p_plan_id uuid, p_end_date date, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_role text; v_id uuid;
BEGIN
 SELECT organization_id,role INTO v_org,v_role FROM profiles
 WHERE id=auth.uid() AND is_active AND contact_id IS NULL;
 IF v_org IS NULL OR v_role NOT IN ('admin','manager','service_manager') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact_id AND organization_id=v_org) THEN RAISE EXCEPTION 'Contact not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM recurring_plans WHERE id=p_plan_id AND organization_id=v_org AND plan_type='vip_plan' AND is_active) THEN RAISE EXCEPTION 'Select an active VIP plan'; END IF;
 IF p_end_date IS NULL OR p_end_date<CURRENT_DATE THEN RAISE EXCEPTION 'Choose a current or future membership end date'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text,0));
 IF EXISTS(SELECT 1 FROM recurring_subscriptions rs JOIN recurring_plans rp ON rp.id=rs.plan_id
  WHERE rs.contact_id=p_contact_id AND rs.organization_id=v_org AND rp.plan_type='vip_plan'
  AND rs.status IN ('active','pending_payment','trial') AND (rs.end_date IS NULL OR rs.end_date>=CURRENT_DATE))
 THEN RAISE EXCEPTION 'Customer already has an active or pending VIP membership'; END IF;
 INSERT INTO recurring_subscriptions(company_id,organization_id,contact_id,plan_id,status,start_date,end_date,next_billing_date,
  custom_amount,auto_invoice,auto_send,auto_renew,created_by,notes,comped_by,comped_at,comp_reason)
 VALUES(v_org,v_org,p_contact_id,p_plan_id,'active',CURRENT_DATE,p_end_date,p_end_date+1,
  0,false,false,false,auth.uid(),'Comped VIP membership; no automatic billing or renewal',auth.uid(),now(),nullif(trim(p_notes),'')) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.grant_comped_vip_membership(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grant_comped_vip_membership(uuid,uuid,date,text) TO authenticated;
-- Keep the customer list in step with portal access when a fixed VIP term ends.
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
WHERE rp.plan_type='vip_plan' AND (s.end_date IS NULL OR s.end_date>=CURRENT_DATE) AND (s.status='active' OR (s.status='trial' AND s.trial_source='vip_trial' AND s.trial_end_date>=CURRENT_DATE))
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

