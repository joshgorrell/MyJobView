/*
  # Add DELETE policy to review_requests table

  ## Problem
  The review_requests table was missing a DELETE RLS policy. This caused deletes
  to silently succeed (no error thrown) but delete 0 rows. The UI would filter
  local state making it appear deleted, but on page refresh the record would
  reappear from the database.

  ## Fix
  Add a DELETE policy allowing authenticated users to delete review requests
  belonging to their organization.
*/

CREATE POLICY "review_requests_delete_same_org"
  ON review_requests
  FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());
