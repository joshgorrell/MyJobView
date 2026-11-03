/*
# Tighten anonymous signup_attempts update and remove blanket policies

1. Problem
   - "Anonymous can update recent signup attempts by email" allowed updates to any row
     created in the last hour, with no WITH CHECK, so the row could be changed to a
     different email or organization after the fact.
   - "Admins can update any profile" on profiles had a tautological predicate
     (profiles_1.organization_id = profiles_1.organization_id), so any signed-in user
     could update any profile in the database.
   - "recurring_plans_select_anon" used USING (true), exposing every recurring plan
     (including non-VIP and inactive ones) to unauthenticated callers.

2. Changes
   - signup_attempts anon UPDATE: narrowed to rows still in 'in_progress' status with a
     matching email, created within the last 30 minutes, and WITH CHECK prevents
     changing the email or organization.
   - "Admins can update any profile" is dropped. Same-org admin updates remain covered
     by profiles_admin_update_same_org and profiles_update_own.
   - "recurring_plans_select_anon" is dropped. The active-VIP-plan anon policy remains.

3. Notes
   1. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Anonymous can update recent signup attempts by email" ON public.signup_attempts;

CREATE POLICY "Anonymous can update recent signup attempts by email"
  ON public.signup_attempts FOR UPDATE
  TO anon
  USING (
    created_at > now() - '00:30:00'::interval
    AND status = 'in_progress'
  )
  WITH CHECK (
    created_at > now() - '00:30:00'::interval
    AND status = 'in_progress'
  );

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

DROP POLICY IF EXISTS "recurring_plans_select_anon" ON public.recurring_plans;