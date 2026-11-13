-- Sales Order billing is an editable copy, never the source proposal schedule.
CREATE TABLE IF NOT EXISTS public.sales_order_billing_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  source_phase_id uuid REFERENCES public.proposal_billing_phases(id) ON DELETE SET NULL,
  row_order integer NOT NULL,
  description text NOT NULL,
  scheduled_amount numeric(14,2) NOT NULL CHECK (scheduled_amount >= 0),
  source_type text NOT NULL DEFAULT 'proposal' CHECK (source_type IN ('proposal','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, row_order)
);
CREATE INDEX IF NOT EXISTS idx_so_billing_rows_order ON public.sales_order_billing_rows (sales_order_id, row_order);
ALTER TABLE public.sales_order_billing_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read org sales order billing rows" ON public.sales_order_billing_rows FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales_orders so JOIN public.profiles p ON p.organization_id = so.company_id WHERE so.id = sales_order_id AND p.id = (SELECT auth.uid())));
CREATE POLICY "Insert org sales order billing rows" ON public.sales_order_billing_rows FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders so JOIN public.profiles p ON p.organization_id = so.company_id WHERE so.id = sales_order_id AND p.id = (SELECT auth.uid())));
CREATE POLICY "Update org sales order billing rows" ON public.sales_order_billing_rows FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales_orders so JOIN public.profiles p ON p.organization_id = so.company_id WHERE so.id = sales_order_id AND p.id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders so JOIN public.profiles p ON p.organization_id = so.company_id WHERE so.id = sales_order_id AND p.id = (SELECT auth.uid())));
CREATE POLICY "Delete org sales order billing rows" ON public.sales_order_billing_rows FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales_orders so JOIN public.profiles p ON p.organization_id = so.company_id WHERE so.id = sales_order_id AND p.id = (SELECT auth.uid())));

-- Initial copy of the proposal's billing layout. Fixed amounts remain fixed;
-- percentage rows are resolved using the approved proposal total.
CREATE OR REPLACE FUNCTION public.seed_sales_order_billing_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sales_order_billing_rows (sales_order_id, source_phase_id, row_order, description, scheduled_amount)
  SELECT NEW.id, phase.id, phase.phase_order, phase.title,
         ROUND(CASE WHEN phase.amount_type = 'percentage'
           THEN COALESCE(p.total,0) * phase.amount / 100
           ELSE phase.amount END, 2)
  FROM public.proposal_billing_phases phase
  JOIN public.proposals p ON p.id = phase.proposal_id
  WHERE phase.proposal_id = NEW.proposal_id
  ORDER BY phase.phase_order;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seed_sales_order_billing_rows ON public.sales_orders;
CREATE TRIGGER trg_seed_sales_order_billing_rows AFTER INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.seed_sales_order_billing_rows();

-- Existing Sales Orders receive the same copy, without changing proposal records.
INSERT INTO public.sales_order_billing_rows (sales_order_id, source_phase_id, row_order, description, scheduled_amount)
SELECT so.id, phase.id, phase.phase_order, phase.title,
       ROUND(CASE WHEN phase.amount_type = 'percentage'
         THEN COALESCE(p.total,0) * phase.amount / 100
         ELSE phase.amount END, 2)
FROM public.sales_orders so
JOIN public.proposals p ON p.id = so.proposal_id
JOIN public.proposal_billing_phases phase ON phase.proposal_id = p.id
WHERE NOT EXISTS (SELECT 1 FROM public.sales_order_billing_rows row WHERE row.sales_order_id = so.id);
