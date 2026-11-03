-- Assignment eligibility is a business designation, independent of access roles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_technician boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_technician IS 'Include active users in technician assignment and scheduling lists. Independent of permissions.';
-- Preserve explicitly technical legacy users during upgrade; do not infer from management roles.
UPDATE public.profiles SET is_technician = true
 WHERE role IN ('tech','technician','field_tech','lead_tech','lead_technician');
CREATE INDEX IF NOT EXISTS profiles_org_technician_idx
 ON public.profiles (organization_id, is_active, full_name) WHERE is_technician;
-- Preserve existing sales designations and prevent users from changing their own eligibility.
CREATE OR REPLACE FUNCTION public.guard_staff_assignment_designations() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE actor_role text; actor_org uuid; actor_active boolean;
BEGIN
 IF current_user IN ('authenticated','anon') AND
   ((TG_OP = 'INSERT' AND (NEW.is_technician OR NEW.is_sales_rep)) OR
    (TG_OP = 'UPDATE' AND (NEW.is_technician IS DISTINCT FROM OLD.is_technician
      OR NEW.is_sales_rep IS DISTINCT FROM OLD.is_sales_rep))) THEN
   SELECT role, organization_id, is_active INTO actor_role, actor_org, actor_active
    FROM public.profiles WHERE id = auth.uid();
   IF actor_role IS DISTINCT FROM 'admin' OR actor_active IS DISTINCT FROM true
     OR actor_org IS DISTINCT FROM NEW.organization_id
     OR (TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
     RAISE EXCEPTION 'Only an active company administrator can change assignment designations';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_staff_assignment_designations() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_staff_assignment_designations BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.guard_staff_assignment_designations();
