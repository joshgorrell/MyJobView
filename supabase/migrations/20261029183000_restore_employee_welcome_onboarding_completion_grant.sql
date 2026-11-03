-- Production audit 2026-10-29: authenticated retained SELECT but lost the
-- column-level UPDATE privilege required by the SECURITY INVOKER RPC.
-- Restore only the two fields the existing own-row RLS policy allows.
-- No employee data or onboarding completion states are changed.
GRANT UPDATE (completed_at, skipped)
  ON TABLE public.employee_welcome_onboarding TO authenticated;
