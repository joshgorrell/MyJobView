/*
  # Allow employees to delete their own pending/denied time requests

  ## Change
  - Adds a DELETE policy on `internal_time_sessions` so that the user who
    submitted a request (requested_by = auth.uid()) can delete it when it is
    still in `pending_approval` or `denied` status.

  ## Why
  Admins could already delete any session. Employees could cancel a pending
  request (UPDATE to 'cancelled') but had no way to fully remove a denied or
  pending request from their history on the Time Clock History page.
*/

CREATE POLICY "Employees can delete their own pending or denied requests"
  ON internal_time_sessions
  FOR DELETE
  TO authenticated
  USING (
    requested_by = auth.uid()
    AND status IN ('pending_approval', 'denied')
  );
