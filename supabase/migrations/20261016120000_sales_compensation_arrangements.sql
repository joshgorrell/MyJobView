-- Compensation arrangements supplement, never replace, salary/hourly timekeeping.
-- Commission earnings and payout timing remain managed by the existing commission engine.
CREATE TABLE IF NOT EXISTS sales_compensation_arrangements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  arrangement_type text NOT NULL CHECK (arrangement_type IN ('base_plus_commission', 'commission_only')),
  base_amount_cents bigint NOT NULL DEFAULT 0 CHECK (base_amount_cents >= 0),
  base_frequency text CHECK (base_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  CONSTRAINT sales_compensation_valid_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT sales_compensation_valid_base CHECK (
    (arrangement_type = 'commission_only' AND base_amount_cents = 0 AND base_frequency IS NULL)
    OR (arrangement_type = 'base_plus_commission' AND base_amount_cents > 0 AND base_frequency IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_compensation_one_current
  ON sales_compensation_arrangements(employee_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS sales_compensation_org_employee
  ON sales_compensation_arrangements(organization_id, employee_id, effective_from DESC);
ALTER TABLE sales_compensation_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_compensation_select ON sales_compensation_arrangements FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());
-- Only administrators may change pay arrangements; tenant isolation is required for every write.
CREATE POLICY sales_compensation_insert ON sales_compensation_arrangements FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND EXISTS
    (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.organization_id = sales_compensation_arrangements.organization_id));
CREATE POLICY sales_compensation_update ON sales_compensation_arrangements FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id() AND EXISTS
    (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.organization_id = sales_compensation_arrangements.organization_id))
  WITH CHECK (organization_id = get_user_org_id() AND EXISTS
    (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.organization_id = sales_compensation_arrangements.organization_id));
CREATE POLICY sales_compensation_delete ON sales_compensation_arrangements FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id() AND EXISTS
    (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.organization_id = sales_compensation_arrangements.organization_id));
-- Guard against historical date-range overlaps, including closed records.
CREATE OR REPLACE FUNCTION prevent_sales_compensation_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_compensation_arrangements s
    WHERE s.employee_id = NEW.employee_id AND s.id <> NEW.id
      AND daterange(s.effective_from, COALESCE(s.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'Sales compensation arrangement effective dates overlap';
  END IF;
  RETURN NEW;
END;
$$;
-- Serialize arrangement writes per employee to avoid concurrent inserts racing the overlap check.
CREATE OR REPLACE FUNCTION lock_sales_compensation_employee() RETURNS trigger LANGUAGE plpgsql AS $lock$
BEGIN
  PERFORM 1 FROM employees WHERE id = NEW.employee_id FOR UPDATE;
  RETURN NEW;
END;
$lock$;
CREATE TRIGGER sales_compensation_employee_lock
  BEFORE INSERT OR UPDATE ON sales_compensation_arrangements
  FOR EACH ROW EXECUTE FUNCTION lock_sales_compensation_employee();

CREATE TRIGGER sales_compensation_no_overlap
  BEFORE INSERT OR UPDATE ON sales_compensation_arrangements
  FOR EACH ROW EXECUTE FUNCTION prevent_sales_compensation_overlap();
