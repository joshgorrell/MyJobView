-- Scope invoice staff attribution to the signed-in user's organization.
-- Replaces role-only RLS policies from the original migration.
DROP POLICY IF EXISTS invoice_staff_assignments_read ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_read ON public.invoice_staff_assignments
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin', 'manager', 'service_manager', 'finance')
  )
);

DROP POLICY IF EXISTS invoice_staff_assignments_insert ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_insert ON public.invoice_staff_assignments
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin', 'manager', 'service_manager', 'finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL
  )
);

DROP POLICY IF EXISTS invoice_staff_assignments_update ON public.invoice_staff_assignments;
CREATE POLICY invoice_staff_assignments_update ON public.invoice_staff_assignments
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin', 'manager', 'service_manager', 'finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.profiles p ON p.organization_id = i.organization_id
    WHERE i.id = invoice_id AND p.id = auth.uid()
      AND p.role IN ('admin', 'manager', 'service_manager', 'finance')
      AND i.status = 'draft' AND i.sales_order_id IS NULL
  )
);
