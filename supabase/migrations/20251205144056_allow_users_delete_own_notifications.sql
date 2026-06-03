/*
  # Allow users to delete their own notifications

  1. Changes
    - Add DELETE policy for notifications table
    - Users can only delete notifications addressed to them
*/

-- Allow users to delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
