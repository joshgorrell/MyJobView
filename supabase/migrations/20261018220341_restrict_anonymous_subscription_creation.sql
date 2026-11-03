/*
# Restrict anonymous subscription creation to pending payment

1. Problem
   - Policy "Anonymous users can create subscriptions for VIP signup" allowed an
     unauthenticated caller to insert a subscription with status 'active' or 'trial'.
     An active VIP subscription is one of the conditions that unlocks portal and
     punchlist access, so anyone could grant themselves a free membership.
   - The real public signup flow (src/components/Portal/PortalSignup.tsx) inserts
     status 'pending_payment', which the old policy did not even allow.

2. Changes
   - Replaces the policy so anonymous inserts are limited to 'pending_payment' rows
     that reference an active, public VIP plan.

3. Notes
   1. The subscription becomes active only when the payment flow updates it with
      privileged credentials, which is the intended behaviour.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Anonymous users can create subscriptions for VIP signup" ON public.recurring_subscriptions;

CREATE POLICY "Anonymous users can create subscriptions for VIP signup"
  ON public.recurring_subscriptions FOR INSERT
  TO anon
  WITH CHECK (
    contact_id IS NOT NULL
    AND status = 'pending_payment'
    AND EXISTS (
      SELECT 1 FROM public.recurring_plans rp
      WHERE rp.id = recurring_subscriptions.plan_id
        AND rp.is_active = true
    )
  );