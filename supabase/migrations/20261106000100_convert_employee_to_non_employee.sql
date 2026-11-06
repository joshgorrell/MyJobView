CREATE OR REPLACE FUNCTION public.convert_employee_to_non_employee(
  p_user_id uuid, p_last_employee_date date, p_reviewed_by uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_employee_id uuid;
  v_hire_date date;
BEGIN
  IF auth.uid() IS NULL OR p_reviewed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized conversion actor';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_org IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND organization_id = v_org AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT id, hire_date INTO v_employee_id, v_hire_date
  FROM public.employees
  WHERE user_id = p_user_id AND organization_id = v_org FOR UPDATE;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Employee record not found'; END IF;

  IF p_last_employee_date IS NULL OR p_last_employee_date > CURRENT_DATE
     OR p_last_employee_date < v_hire_date THEN
    RAISE EXCEPTION 'Invalid last employee date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_payroll_configs
    WHERE employee_id = v_employee_id AND effective_from > p_last_employee_date
  ) THEN RAISE EXCEPTION 'Future payroll configuration requires review'; END IF;

  -- Do not silently strand payroll time already generated after the requested end date.
  IF EXISTS (
    SELECT 1 FROM public.payroll_time_segments
    WHERE employee_id = p_user_id AND segment_date > p_last_employee_date
  ) THEN
    RAISE EXCEPTION 'Payroll time exists after last employee date; reconcile it before conversion';
  END IF;

  UPDATE public.employee_payroll_configs
  SET effective_to = p_last_employee_date, updated_at = now()
  WHERE employee_id = v_employee_id
    AND effective_from <= p_last_employee_date
    AND (effective_to IS NULL OR effective_to > p_last_employee_date);

  UPDATE public.employees
  SET employment_status = 'terminated',
      termination_date = p_last_employee_date,
      updated_at = now()
  WHERE id = v_employee_id;

  UPDATE public.profiles
  SET employment_classification = 'non_employee',
      employment_classification_reviewed_at = now(),
      employment_classification_reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'employee_id', v_employee_id);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_employee_to_non_employee(uuid,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_employee_to_non_employee(uuid,date,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_employee_to_non_employee(uuid,date,uuid) TO authenticated;
