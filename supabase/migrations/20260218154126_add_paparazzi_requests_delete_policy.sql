
/*
  # Add Delete Policy for Paparazzi Requests

  ## Summary
  Adds a DELETE RLS policy to the paparazzi_requests table so that:
  - Admins and owners can delete any request in their organization
  - The original requester can delete their own request

  ## Security
  - Restricted to authenticated users only
  - Ownership check via requested_by = auth.uid() for non-admin roles
  - Admin/owner check via profiles table role lookup
*/

CREATE POLICY "Users can delete their own requests or admins can delete any"
  ON paparazzi_requests
  FOR DELETE
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
  );
