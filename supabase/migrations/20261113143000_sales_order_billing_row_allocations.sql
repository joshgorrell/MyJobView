-- Track which editable Sales Order schedule rows were invoiced, independently
-- of the approved proposal and of Change Order invoice links.
CREATE TABLE IF NOT EXISTS public.sales_order_billing_row_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_row_id uuid NOT NULL REFERENCES public.sales_order_billing_rows(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  description_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_row_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_so_billing_alloc_invoice ON public.sales_order_billing_row_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_so_billing_alloc_row ON public.sales_order_billing_row_allocations(billing_row_id);
ALTER TABLE public.sales_order_billing_row_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read billing row allocations for own organization"
ON public.sales_order_billing_row_allocations FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.sales_order_billing_rows r
 JOIN public.sales_orders so ON so.id = r.sales_order_id
 JOIN public.profiles p ON p.organization_id = so.company_id
 WHERE r.id = billing_row_id AND p.id = (SELECT auth.uid())
));
CREATE POLICY "Insert billing row allocations for own organization"
ON public.sales_order_billing_row_allocations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
 SELECT 1 FROM public.sales_order_billing_rows r
 JOIN public.sales_orders so ON so.id = r.sales_order_id
 JOIN public.invoices i ON i.id = invoice_id AND i.sales_order_id = so.id
 JOIN public.profiles p ON p.organization_id = so.company_id
 WHERE r.id = billing_row_id AND p.id = (SELECT auth.uid())
));
-- Allocations are historical records. Voided invoices are excluded from
-- billed totals by joining invoice.status, not by deleting allocations.
CREATE OR REPLACE VIEW public.sales_order_billing_row_balances
WITH (security_invoker = true) AS
SELECT r.id AS billing_row_id, r.sales_order_id, r.row_order,
       r.description, r.scheduled_amount,
       COALESCE(SUM(a.amount) FILTER (WHERE i.status IS DISTINCT FROM 'void'), 0)::numeric(14,2) AS invoiced_amount,
       (r.scheduled_amount - COALESCE(SUM(a.amount) FILTER (WHERE i.status IS DISTINCT FROM 'void'), 0))::numeric(14,2) AS scheduled_remaining
FROM public.sales_order_billing_rows r
LEFT JOIN public.sales_order_billing_row_allocations a ON a.billing_row_id = r.id
LEFT JOIN public.invoices i ON i.id = a.invoice_id
GROUP BY r.id;
