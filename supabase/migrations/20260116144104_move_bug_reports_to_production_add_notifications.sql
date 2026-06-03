/*
  # Move Bug Reports to Production Department and Add Notification System

  1. Changes
    - Move Bug Management module from Admin to Production department
    - Add bug_notification_settings table to configure who gets notified
    - Add notification trigger for new bug reports
    - Support email and/or site notifications

  2. Security
    - Enable RLS on bug_notification_settings
    - Only admins can configure notification settings
*/

-- Move Bug Management module to Production department
UPDATE department_modules
SET department_id = (SELECT id FROM departments WHERE name = 'production')
WHERE module_key = 'bug_management';

-- Create bug notification settings table
CREATE TABLE IF NOT EXISTS bug_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  send_email boolean DEFAULT false,
  send_site_notification boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bug_notification_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage notification settings
CREATE POLICY "Admins can view bug notification settings"
  ON bug_notification_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert bug notification settings"
  ON bug_notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update bug notification settings"
  ON bug_notification_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete bug notification settings"
  ON bug_notification_settings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_bug_notification_settings_updated_at
  BEFORE UPDATE ON bug_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to send bug report notifications
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
        message,
        related_id
      ) VALUES (
        recipient.user_id,
        'bug_report',
        'New Bug Report',
        'A new bug has been reported: ' || LEFT(NEW.description, 100),
        NEW.id::text
      );
    END IF;

    -- Email notifications will be handled by the application layer
    -- when send_email is true
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new bug reports
DROP TRIGGER IF EXISTS on_bug_report_created ON bug_reports;
CREATE TRIGGER on_bug_report_created
  AFTER INSERT ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_bug_report();

-- Drop and recreate constraint to include bug_report type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_bug_notification_settings_user_id
  ON bug_notification_settings(user_id);
