/*
  # Allow Anonymous Users to View VIP Plans

  1. Changes
    - Allow anonymous users to view active recurring plans shown on portal
    - This is needed for the public VIP signup page

  2. Security
    - Only active plans with show_on_portal = true are visible
    - Only SELECT access, no INSERT/UPDATE/DELETE
*/

-- Allow anonymous users to view active VIP plans shown on portal
CREATE POLICY "Anonymous users can view active VIP plans"
  ON recurring_plans FOR SELECT
  TO anon
  USING (
    is_active = true 
    AND punchlist_enabled = true
    AND show_on_portal = true
  );
