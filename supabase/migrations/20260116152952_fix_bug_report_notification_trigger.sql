/*
  # Fix Bug Report Notification Trigger

  1. Changes
    - Fix notify_bug_report function to use correct column name (body instead of message)
    - This resolves the error when creating bug reports

  2. Notes
    - The trigger was using 'message' column which doesn't exist
    - The correct column name is 'body'
*/

-- Recreate the function with correct column names
CREATE OR REPLACE FUNCTION notify_bug_report()
RETURNS TRIGGER AS $$
DECLARE
  recipient RECORD;
BEGIN
  -- Send notifications to all configured recipients
  FOR recipient IN
    SELECT
      bns.user_id,
      bns.send_email,
      bns.send_site_notification,
      p.full_name,
      p.email
    FROM bug_notification_settings bns
    JOIN profiles p ON p.id = bns.user_id
  LOOP
    -- Send site notification if enabled
    IF recipient.send_site_notification THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        related_id
      ) VALUES (
        recipient.user_id,
        'bug_report',
        'New Bug Report',
        'A new bug has been reported: ' || LEFT(NEW.description, 100),
        NEW.id
      );
    END IF;

    -- Email notifications will be handled by the application layer
    -- when send_email is true
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
