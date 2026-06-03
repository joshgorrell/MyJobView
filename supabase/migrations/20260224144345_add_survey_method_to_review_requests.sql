/*
  # Add 'survey' to review_requests method constraint

  ## Summary
  The review_requests table has a check constraint on the `method` column that only
  allows: 'email', 'sms', 'qr_code', 'manual'. However, the application also sends
  job completion surveys using method = 'survey', which violates this constraint.

  ## Changes
  - Drops the existing `review_requests_method_check` constraint
  - Re-adds it with 'survey' included as a valid value
*/

ALTER TABLE review_requests
  DROP CONSTRAINT IF EXISTS review_requests_method_check;

ALTER TABLE review_requests
  ADD CONSTRAINT review_requests_method_check
  CHECK (method = ANY (ARRAY['email'::text, 'sms'::text, 'qr_code'::text, 'manual'::text, 'survey'::text]));
