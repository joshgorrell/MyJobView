-- Durable credit events: no direct client access. Attribution is snapshotted.
CREATE TABLE IF NOT EXISTS public.sales_performance_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  credited_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('sales_order','service_invoice','retail_invoice','recurring_invoice','adjustment')),
  source_id uuid NOT NULL,
  source_event_key text NOT NULL,
  effective_at timestamptz NOT NULL,
  net_amount numeric(14,2) NOT NULL,
  attribution_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_event_key)
);
CREATE INDEX IF NOT EXISTS idx_sales_performance_credits_rep_period ON public.sales_performance_credits (organization_id, credited_rep_id, effective_at);
ALTER TABLE public.sales_performance_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_performance_credits FROM PUBLIC, anon, authenticated;

-- Read-only, current-month competition. No client-supplied historical date.
-- SECURITY DEFINER is essential: only aggregates leave this function.
CREATE OR REPLACE FUNCTION public.get_current_month_sales_competition()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_caller uuid := auth.uid();
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_entries jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.profiles
  WHERE id = v_caller
    AND (is_sales_rep = true OR role IN ('admin','manager'));
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not authorized for sales competition';
  END IF;

  -- The credit ledger is intentionally separate from commissions. Only
  -- server-authorized writes should populate the ledger.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'rank', ranked.rank,
      'repDisplayName', ranked.display_name,
      'monthlyTotal', ranked.total,
      'isCurrentUser', ranked.id = v_caller
    ) ORDER BY ranked.rank
  ), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT p.id,
      COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.full_name, 'Sales rep') AS display_name,
      COALESCE(SUM(c.net_amount), 0) AS total,
      rank() OVER (ORDER BY COALESCE(SUM(c.net_amount), 0) DESC) AS rank
    FROM public.profiles p
    LEFT JOIN public.sales_performance_credits c
      ON c.credited_rep_id = p.id
      AND c.organization_id = v_org
      AND c.effective_at >= v_month_start
      AND c.effective_at < v_month_end
    WHERE p.organization_id = v_org AND p.is_sales_rep = true
    GROUP BY p.id, p.first_name, p.last_name, p.full_name
  ) ranked;

  RETURN jsonb_build_object('month', to_char(v_month_start, 'YYYY-MM'), 'leaderboard', v_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_month_sales_competition() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_month_sales_competition() TO authenticated;

-- Posting hooks and backfill are deliberately NOT enabled until invoice
-- source classification, customer ownership mapping and reversal semantics
-- have been verified. Empty ledger means empty competition, not inferred data.
