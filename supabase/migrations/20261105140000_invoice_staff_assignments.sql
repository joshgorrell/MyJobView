-- Invoice assignment attribution, independent of commission earnings.
-- Project invoice roles remain sourced from the sales order; no project rows
-- may be inserted here. This table only stores standalone service/retail drafts.
CREATE TABLE IF NOT EXISTS public.invoice_staff_assignments (
  invoice_id uuid PRIMARY KEY REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_kind text NOT NULL CHECK (invoice_kind IN ('service', 'retail')),
  sales_rep_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  service_manager_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retail_has_no_manager CHECK (invoice_kind <> 'retail' OR service_manager_id IS NULL)
);

COMMENT ON TABLE public.invoice_staff_assignments IS
  'Draft standalone invoice staff attribution only; not commission awards. Project roles inherit from sales orders.';

CREATE OR REPLACE FUNCTION public.validate_invoice_staff_assignments()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_has_work_order boolean;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_invoice.sales_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Project invoice assignments must come from the sales order';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice assignments are locked after draft submission';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.invoice_line_item_sources s
    JOIN public.invoice_line_items li ON li.id = s.invoice_line_item_id
    WHERE li.invoice_id = NEW.invoice_id AND (s.source_type = 'work_order' OR s.source_type LIKE 'work\\_order\\_%' ESCAPE '\\')
  ) INTO v_has_work_order;
  IF v_has_work_order AND NEW.invoice_kind <> 'service' THEN
    RAISE EXCEPTION 'Work-order invoices must be classified as service';
  END IF;
  IF NEW.invoice_kind = 'retail' AND NEW.service_manager_id IS NOT NULL THEN
    RAISE EXCEPTION 'Retail invoices cannot have a service manager';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_staff_assignments ON public.invoice_staff_assignments;
CREATE TRIGGER trg_validate_invoice_staff_assignments
BEFORE INSERT OR UPDATE ON public.invoice_staff_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_staff_assignments();

ALTER TABLE public.invoice_staff_assignments ENABLE ROW LEVEL SECURITY;

-- Only billing-authorized staff may access this internal attribution table.
DROP POLICY IF EXISTS invoice_staff_assignments_read ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_read ON public.invoice_staff_assignments
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'service_manager', 'finance'))
);

DROP POLICY IF EXISTS invoice_staff_assignments_insert ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_insert ON public.invoice_staff_assignments
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'service_manager', 'finance'))
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND i.status = 'draft' AND i.sales_order_id IS NULL)
);

DROP POLICY IF EXISTS invoice_staff_assignments_update ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_update ON public.invoice_staff_assignments
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'service_manager', 'finance'))
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND i.status = 'draft' AND i.sales_order_id IS NULL)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'service_manager', 'finance'))
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND i.status = 'draft' AND i.sales_order_id IS NULL)
);

-- Deliberately no DELETE policy: historical attribution must not be erased.
-- No commission trigger, payout calculation, or existing invoice schema changes.
