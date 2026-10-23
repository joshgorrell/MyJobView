-- Rewards ledgers are server-owned. Authenticated clients retain SELECT
-- subject to existing organization RLS; only vetted SECURITY DEFINER
-- routines / trusted service jobs may mutate these tables.
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.points_transactions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.reward_redemptions FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS points_transactions_insert_same_org ON public.points_transactions;
DROP POLICY IF EXISTS points_transactions_update_same_org ON public.points_transactions;
DROP POLICY IF EXISTS points_transactions_delete_same_org ON public.points_transactions;
DROP POLICY IF EXISTS reward_redemptions_insert_same_org ON public.reward_redemptions;
DROP POLICY IF EXISTS reward_redemptions_update_same_org ON public.reward_redemptions;
DROP POLICY IF EXISTS reward_redemptions_delete_same_org ON public.reward_redemptions;

-- Keep existing organization-scoped SELECT policies, no blanket read grant.
-- RPCs must validate auth.uid(), ownership, balance and stock before writing.
