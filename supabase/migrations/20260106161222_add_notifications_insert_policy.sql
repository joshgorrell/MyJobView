/*
  # Add Insert Policy for Notifications

  1. Security
    - Add INSERT policy for notifications table
    - Allow authenticated users to create notifications for any user
    - This is needed for system notifications, admin notifications, and automated processes

  2. Changes
    - Add RLS policy for INSERT operations on notifications
*/

-- Add INSERT policy for notifications
CREATE POLICY "System can create notifications for users"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON POLICY "System can create notifications for users" ON notifications IS
'Allows authenticated users and system processes to create notifications for any user. 
This is required for admin notifications, automated processes (auto clock-out, task assignments, etc.), 
and system-generated notifications.';
