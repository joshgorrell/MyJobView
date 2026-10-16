-- Atomic effective-dated compensation change. Invoker's RLS policies still apply.
CREATE OR REPLACE FUNCTION save_sales_compensation_arrangement(
  p_employee_id uuid,
  p_arrangement_type text,
  p_base_amount_cents bigint DEFAULT 0,
  p_base_frequency text DEFAULT NULL,
  p_effective_from date DEFAULT CURRENT_DATE
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_employee employees%ROWTYPE;
  v_existing sales_compensation_arrangements%ROWTYPE;
BEGIN
  IF p_effective_from IS NULL OR p_effective_from <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Compensation changes must be effective today';
  END IF;
  IF p_arrangement_type NOT IN ('none', 'base_plus_commission', 'commission_only') THEN
    RAISE EXCEPTION 'Unsupported compensation arrangement';
  END IF;
  IF p_arrangement_type = 'base_plus_commission' AND
     (p_base_amount_cents IS NULL OR p_base_amount_cents <= 0 OR
      p_base_frequency NOT IN ('weekly', 'biweekly', 'semimonthly', 'monthly')) THEN
    RAISE EXCEPTION 'Guaranteed base amount and pay frequency are required';
  END IF;
  SELECT * INTO v_employee FROM employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found or not authorized'; END IF;
  SELECT * INTO v_existing FROM sales_compensation_arrangements
    WHERE employee_id = p_employee_id AND effective_to IS NULL FOR UPDATE;
  IF FOUND THEN
    IF v_existing.effective_from = p_effective_from THEN
      DELETE FROM sales_compensation_arrangements WHERE id = v_existing.id;
    ELSIF v_existing.effective_from < p_effective_from THEN
      UPDATE sales_compensation_arrangements
        SET effective_to = p_effective_from - 1, updated_by = auth.uid(), updated_at = now()
        WHERE id = v_existing.id;
    ELSE
      RAISE EXCEPTION 'Cannot overwrite future-dated compensation';
    END IF;
  END IF;
  IF p_arrangement_type <> 'none' THEN
    INSERT INTO sales_compensation_arrangements(
      organization_id, employee_id, arrangement_type, base_amount_cents,
      base_frequency, effective_from, created_by, updated_by
    ) VALUES (
      v_employee.organization_id, p_employee_id, p_arrangement_type,
      CASE WHEN p_arrangement_type = 'base_plus_commission' THEN p_base_amount_cents ELSE 0 END,
      CASE WHEN p_arrangement_type = 'base_plus_commission' THEN p_base_frequency ELSE NULL END,
      p_effective_from, auth.uid(), auth.uid()
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION save_sales_compensation_arrangement(uuid,text,bigint,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_sales_compensation_arrangement(uuid,text,bigint,text,date) TO authenticated;
