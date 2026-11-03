/*
# Remove anonymous writes to payment methods and subscription payments

1. Problem
   - "Anonymous users can create payment methods for VIP signup" let anyone attach a
     payment method record to any customer in any organization.
   - "Anonymous users can create subscription payments for VIP signup" let anyone
     record an arbitrary payment against any customer's subscription, which can make
     a subscription look paid without any money changing hands.

2. Changes
   - Drops both anonymous insert policies.
   - Organization-scoped policies for signed-in users remain in place, so the customer
     portal (whose users are signed in) keeps working.

3. Notes
   1. No application code writes these tables with the anonymous key.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Anonymous users can create payment methods for VIP signup" ON public.payment_methods;
DROP POLICY IF EXISTS "Anonymous users can create subscription payments for VIP signup" ON public.subscription_payments;