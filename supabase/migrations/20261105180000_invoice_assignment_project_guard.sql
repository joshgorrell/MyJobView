-- Prevent standalone attribution on any project-linked invoice, including invoices
-- with project_id set but sales_order_id absent.
CREATE OR REPLACE FUNCTION public.validate_invoice_staff_assignments()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_has_work_order boolean;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.sales_order_id IS NOT NULL OR v_invoice.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Project invoice assignments must come from the sales order';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice assignments are locked after draft submission';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.invoice_line_item_sources s
    JOIN public.invoice_line_items li ON li.id = s.invoice_line_item_id
    WHERE li.invoice_id = NEW.invoice_id
      AND (s.source_type = 'work_order' OR left(s.source_type, 11) = 'work_order_')
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

DROP POLICY IF EXISTS invoice_staff_assignments_insert ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_insert ON public.invoice_staff_assignments
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin','manager','service_manager','finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL AND i.project_id IS NULL)
);
DROP POLICY IF EXISTS invoice_staff_assignments_update ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_update ON public.invoice_staff_assignments
FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin','manager','service_manager','finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL AND i.project_id IS NULL)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin','manager','service_manager','finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL AND i.project_id IS NULL)
);
