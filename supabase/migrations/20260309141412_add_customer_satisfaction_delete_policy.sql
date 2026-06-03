/*
  # Add delete policy to customer_satisfaction table

  ## Summary
  Adds a DELETE RLS policy so authenticated users can delete satisfaction survey
  records that belong to their organization. This allows admins and managers to
  clean up history items from the Reviews page.

  ## Security
  - Only authenticated users can delete
  - Users can only delete records within their own organization
*/

CREATE POLICY "Users can delete satisfaction records in their org"
  ON customer_satisfaction
  FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());
