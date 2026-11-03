-- PM is a share of quoted labor, never additional labor. Keep the existing
-- Test & Tune control; move its PM value into company scope. Existing orders
-- retain their allocation when a dealer changes the default for new orders.
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.organizations ADD COLUMN pm_allocation_percentage numeric NOT NULL DEFAULT 5
 CHECK (pm_allocation_percentage BETWEEN 0 AND 50);
ALTER TABLE public.sales_orders ADD COLUMN pm_allocation_percentage numeric
 CHECK (pm_allocation_percentage BETWEEN 0 AND 50);

-- The legacy settings row has no organization_id. Only inherit it when there
-- is exactly one organization; never assign one dealer's settings to another.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.organizations)=1 THEN
  UPDATE public.organizations SET pm_allocation_percentage=COALESCE(
   (SELECT pm_allocation_percentage FROM public.test_tune_settings LIMIT 1),5);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION private.company_pm_percentage(p_org uuid,p_day date)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE(
  (SELECT h.new_value::numeric FROM public.test_tune_settings_history h
   WHERE h.organization_id=p_org AND h.field_name='pm_allocation_percentage'
    AND COALESCE(h.effective_date,h.changed_at::date)<=p_day
    AND h.new_value ~ '^([0-9]+)([.][0-9]+)?$'
   ORDER BY COALESCE(h.effective_date,h.changed_at::date) DESC,h.changed_at DESC LIMIT 1),
  (SELECT h.old_value::numeric FROM public.test_tune_settings_history h
   WHERE h.organization_id=p_org AND h.field_name='pm_allocation_percentage'
    AND COALESCE(h.effective_date,h.changed_at::date)>p_day
    AND h.old_value ~ '^([0-9]+)([.][0-9]+)?$'
   ORDER BY COALESCE(h.effective_date,h.changed_at::date),h.changed_at LIMIT 1),
  (SELECT o.pm_allocation_percentage FROM public.organizations o WHERE o.id=p_org),5);
$$;
REVOKE ALL ON FUNCTION private.company_pm_percentage(uuid,date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_company_pm_allocation()
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false;
 IF org IS NULL THEN RAISE EXCEPTION 'Authenticated company required'; END IF;
 RETURN private.company_pm_percentage(org,CURRENT_DATE);
END $$;
REVOKE ALL ON FUNCTION public.get_company_pm_allocation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_company_pm_allocation() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_company_pm_allocation(p_percentage numeric,p_effective_date date DEFAULT CURRENT_DATE,p_reason text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; prior numeric; latest date;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active IS DISTINCT FROM false;
 IF org IS NULL THEN RAISE EXCEPTION 'Dealer admin required'; END IF;
 IF p_percentage IS NULL OR p_percentage<0 OR p_percentage>50 OR p_percentage::text='NaN' THEN RAISE EXCEPTION 'PM allocation must be between 0 and 50 percent'; END IF;
 IF p_effective_date IS NULL OR p_effective_date<CURRENT_DATE THEN RAISE EXCEPTION 'Use today or a future effective date; existing order allocations are preserved'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
 SELECT max(COALESCE(effective_date,changed_at::date)) INTO latest FROM public.test_tune_settings_history WHERE organization_id=org AND field_name='pm_allocation_percentage';
 IF latest>p_effective_date THEN RAISE EXCEPTION 'A later PM allocation is already scheduled'; END IF;
 prior:=private.company_pm_percentage(org,p_effective_date);
 UPDATE public.organizations SET pm_allocation_percentage=p_percentage WHERE id=org;
 INSERT INTO public.test_tune_settings_history(organization_id,field_name,old_value,new_value,changed_by,effective_date,reason)
 VALUES(org,'pm_allocation_percentage',prior::text,p_percentage::text,auth.uid(),p_effective_date,p_reason);
 RETURN p_percentage;
END $$;
REVOKE ALL ON FUNCTION public.set_company_pm_allocation(numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_company_pm_allocation(numeric,date,text) TO authenticated;

-- Snapshot the default on order creation; setting changes cannot rewrite jobs.
UPDATE public.sales_orders s SET pm_allocation_percentage=CASE
 WHEN s.total_estimated_labor_hours>0 AND s.pm_labor_allocation_hours>0
  AND s.pm_labor_allocation_hours/s.total_estimated_labor_hours<=0.5
 THEN s.pm_labor_allocation_hours/s.total_estimated_labor_hours*100
 ELSE private.company_pm_percentage(s.organization_id,COALESCE(s.created_at::date,CURRENT_DATE)) END;
CREATE OR REPLACE FUNCTION public.snapshot_order_pm_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.pm_allocation_percentage:=private.company_pm_percentage(NEW.organization_id,CURRENT_DATE);
 ELSIF NEW.pm_allocation_percentage IS DISTINCT FROM OLD.pm_allocation_percentage THEN
  RAISE EXCEPTION 'An existing order PM allocation is preserved';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_order_pm_allocation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_order_pm_allocation BEFORE INSERT OR UPDATE OF pm_allocation_percentage ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_pm_allocation();

CREATE OR REPLACE FUNCTION private.order_pm_percentage(p_order uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE(s.pm_allocation_percentage,5) FROM public.sales_orders s WHERE s.id=p_order;
$$;
REVOKE ALL ON FUNCTION private.order_pm_percentage(uuid) FROM PUBLIC;

-- Patch the established calculation bodies without copying their unrelated
-- bonus/approval behavior. Abort on an unexpected definition, never silently
-- leave half the application on a different allocation formula.
DO $$ DECLARE def text; patched text; BEGIN
 def:=pg_get_functiondef('public.calculate_test_tune_bonus(uuid)'::regprocedure);
 patched:=replace(def,'v_total_estimated_labor * 0.95','v_total_estimated_labor * (1-private.order_pm_percentage(p_sales_order_id)/100.0)');
 IF patched=def THEN RAISE EXCEPTION 'Bonus allocation formula not found'; END IF;
 EXECUTE patched;
 def:=pg_get_functiondef('public.recalculate_field_target_on_change_order_approval()'::regprocedure);
 patched:=replace(replace(def,'v_new_total * 0.05','v_new_total * private.order_pm_percentage(v_sales_order_id)/100.0'),
 'v_new_total * 0.95','v_new_total * (1-private.order_pm_percentage(v_sales_order_id)/100.0)');
 IF patched=def THEN RAISE EXCEPTION 'Change-order allocation formula not found'; END IF;
 EXECUTE patched;
END $$;

-- Missing mappings currently default to field labor. Add the explicit PM
-- exclusion without overriding a dealer's existing deliberate mapping.
INSERT INTO public.labor_phase_performance_mapping(labor_phase_id,organization_id,counts_against_target)
SELECT l.id,l.organization_id,false FROM public.labor_phases l
WHERE lower(trim(l.name))='project management'
ON CONFLICT(labor_phase_id) DO NOTHING;

COMMENT ON COLUMN public.sales_orders.pm_allocation_percentage IS 'Quoted-labor share reserved for PM at order creation. Field target = quoted hours * (1 - percentage/100); PM is not additional labor.';

-- The existing history policies check roles but not company ownership.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='test_tune_settings_history' LOOP
  EXECUTE format('DROP POLICY %I ON public.test_tune_settings_history',p.policyname);
 END LOOP;
END $$;
CREATE POLICY company_settings_history_read ON public.test_tune_settings_history FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=test_tune_settings_history.organization_id AND p.is_active IS DISTINCT FROM false AND p.role IN ('admin','super_admin','finance','sales_manager','production_manager','office_manager')));
CREATE POLICY company_settings_history_insert ON public.test_tune_settings_history FOR INSERT TO authenticated WITH CHECK (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=test_tune_settings_history.organization_id AND p.is_active IS DISTINCT FROM false
 AND p.role IN ('admin','super_admin','finance','sales_manager') AND (field_name<>'pm_allocation_percentage' OR p.role='admin')));
