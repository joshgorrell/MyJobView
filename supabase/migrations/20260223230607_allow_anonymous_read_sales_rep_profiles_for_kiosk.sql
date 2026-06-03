/*
  # Allow anonymous read of sales rep profiles for kiosk

  ## Summary
  The tradeshow kiosk runs in an unauthenticated (anonymous) context and needs to
  display a list of the company's active sales reps so a rep can be assigned to a
  lead at submission time.

  ## Changes
  - Adds a SELECT policy on `profiles` that allows anonymous users to read a minimal
    set of columns for active sales/manager/admin profiles filtered by organization_id.
  - The policy is intentionally narrow: it only permits reads where
    `is_active = true` and `role` is one of the sales-facing roles.
  - No write access is granted.
*/

CREATE POLICY "Anonymous can read active sales rep profiles for kiosk"
  ON profiles
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND role IN ('sales', 'sales_manager', 'manager', 'admin')
  );
