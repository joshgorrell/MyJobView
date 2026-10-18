/*
# Remove anonymous access to proposal messages

1. Problem
   - "Customers can view public proposal messages" let anyone, signed in or not,
     read every non-internal message on every proposal in every organization.
   - "Customers can send messages" let anyone insert a message claiming to be from
     a customer, on any proposal in any organization.

2. Changes
   - Drops both anonymous policies.
   - The existing organization-scoped policies for signed-in staff are unchanged, so
     internal use of the proposal conversation continues to work.

3. Notes
   1. No application code reads or writes proposal_messages with the anonymous key,
      so no feature depends on these policies.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Customers can view public proposal messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Customers can send messages" ON public.proposal_messages;