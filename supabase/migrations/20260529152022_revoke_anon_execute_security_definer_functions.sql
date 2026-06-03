/*
  # Revoke anon EXECUTE on SECURITY DEFINER functions

  These functions are SECURITY DEFINER but have no business being callable by
  unauthenticated (anon) users. Revoking EXECUTE from the anon role prevents
  unauthenticated API calls via /rest/v1/rpc/<function>.

  Functions that legitimately need anon access (e.g. submit_security_onboarding,
  validate_discount_code, record_invoice_open) are intentionally left with
  authenticated-only access since they are called from portal/edge-function
  contexts that supply a JWT.

  Trigger functions (update_project_notes_updated_at) are not callable via RPC
  but the anon grant is still revoked as defence-in-depth.
*/

-- Anon-only grants revoked (these were flagged as "Public Can Execute")
REVOKE EXECUTE ON FUNCTION public.contact_has_active_vip_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_applicable_tax_rate(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_contact_portal_access_level(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_proposal_payment_methods(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_security_onboarding(text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_project_notes_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_discount_code(text) FROM anon;
