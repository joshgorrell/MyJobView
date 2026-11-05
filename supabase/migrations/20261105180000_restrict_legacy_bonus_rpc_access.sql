-- Retire direct client execution of legacy project performance bonus RPCs.
-- The customer-facing 90-day Test & Tune program is unaffected.
-- Preserve definitions and historical records for future Commission Management work.

REVOKE EXECUTE ON FUNCTION public.calculate_test_tune_bonus(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_bonus_override(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
