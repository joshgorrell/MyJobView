/*
# Remove anonymous read and write access to customer_satisfaction

1. Problem
   - Policy "Anonymous can read record by token" was defined as USING (true), so any
     unauthenticated caller could download every satisfaction survey, including the
     customer name, email, comment and the response token, for every organization.
   - Policy "Anonymous can submit feedback via token" checked only that
     `response_token IS NOT NULL`, so an unauthenticated caller could overwrite every
     survey row in the table with a single request.

2. Changes
   - Drops both anonymous policies.
   - No replacement is needed: the public feedback page at
     `src/components/Public/FeedbackPage.tsx` submits through the
     `submit-customer-feedback` edge function, which uses the service role and
     resolves the row by its token server side.

3. Notes
   1. Staff access through the organization scoped policies is unchanged.
   2. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Anonymous can read record by token" ON public.customer_satisfaction;
DROP POLICY IF EXISTS "Anonymous can submit feedback via token" ON public.customer_satisfaction;