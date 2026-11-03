/*
# Punchlist Access Function Corrections

## Summary

Fixes two function definitions that were blocking or inconsistently enforcing
Punchlist access after the initial corrective migration.

## What This Fixes

1. **Module key mismatch (critical)** — `private.punchlist_staff_access` called
   `flow_has_module_access('punchlist_admin')`, but the actual module key in
   `department_modules` is `punchlist`. Because `can_access_page` checks module
   existence before the admin-role bypass, every staff user (including admins)
   was denied access to punchlist data through RLS policies. This updates the
   function to use the correct key `punchlist`.

2. **Entitlement check inconsistency** — `contact_has_punchlist_access` (used by
   the BEFORE INSERT trigger `check_punchlist_access_for_task`) only checked
   `punchlist_access_grants` and did not verify VIP trial validity. The RLS
   policy's `private.punchlist_entitled` checks both VIP subscriptions and
   access grants with the `vip_trial` condition. This aligns the trigger's check
   with the same logic so both gates enforce identical rules.

## Functions Modified
- private.punchlist_staff_access — module key changed from 'punchlist_admin' to 'punchlist'
- public.contact_has_punchlist_access — now delegates to private.punchlist_entitled

## Security Changes
- None (no policy or table changes)

## Important Notes
- Both changes are CREATE OR REPLACE FUNCTION, so the migration is idempotent.
- The module key `punchlist` matches the row in `department_modules` for the
  Production department's Punchlist page.
*/

-- 1. Fix module key: 'punchlist_admin' -> 'punchlist'
CREATE OR REPLACE FUNCTION private.punchlist_staff_access(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT COALESCE((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.organization_id = p_org
        AND p.contact_id IS NULL
        AND p.role NOT IN ('portal_user','customer','portal','client')
        AND public.flow_has_module_access('punchlist')
    );
$$;
REVOKE ALL ON FUNCTION private.punchlist_staff_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.punchlist_staff_access(uuid) TO authenticated;

-- 2. Align contact_has_punchlist_access with private.punchlist_entitled
CREATE OR REPLACE FUNCTION public.contact_has_punchlist_access(p_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recurring_subscriptions s
    JOIN public.recurring_plans rp ON rp.id = s.plan_id
    WHERE s.contact_id = p_contact_id
      AND s.status = 'active'
      AND rp.plan_type = 'vip_plan'
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
      AND s.next_billing_date >= CURRENT_DATE
  )
  OR EXISTS (
    SELECT 1 FROM public.punchlist_access_grants g
    LEFT JOIN public.recurring_subscriptions s ON s.id = g.subscription_id
    WHERE g.contact_id = p_contact_id
      AND g.status = 'active'
      AND (g.expiration_date IS NULL OR g.expiration_date >= CURRENT_DATE)
      AND (g.access_type <> 'vip_trial'
           OR (s.status IN ('trial','active')
               AND s.trial_source = 'vip_trial'
               AND s.trial_end_date >= CURRENT_DATE))
  );
$$;
REVOKE ALL ON FUNCTION public.contact_has_punchlist_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_has_punchlist_access(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
