/*
  # Add VIP Signup Notifications

  1. New Trigger
    - Automatically notify admins when a new VIP subscription is created
    - Creates notifications for all admin users
    - Tracks new VIP signups for visibility

  2. Changes
    - Add trigger on recurring_subscriptions insert
    - Create notifications for admin roles
    - Include subscription details in notification
*/

-- Function to notify admins of new VIP signups
CREATE OR REPLACE FUNCTION notify_admins_of_vip_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_name text;
  v_plan_name text;
  v_admin_profile record;
BEGIN
  -- Only proceed if this is a new active subscription (not trial or pending)
  IF NEW.status = 'active' AND NEW.notes LIKE '%Self-service signup%' THEN
    -- Get contact details
    SELECT full_name INTO v_contact_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Get plan details
    SELECT plan_name INTO v_plan_name
    FROM recurring_plans
    WHERE id = NEW.plan_id;

    -- Create notifications for all admins
    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE role = 'admin'
    LOOP
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id,
        created_at
      ) VALUES (
        v_admin_profile.id,
        'vip_signup',
        'New VIP Member Signup',
        v_contact_name || ' has signed up for ' || v_plan_name || ' VIP membership',
        NEW.id::text,
        now()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new subscriptions
DROP TRIGGER IF EXISTS notify_admins_vip_signup_trigger ON recurring_subscriptions;
CREATE TRIGGER notify_admins_vip_signup_trigger
  AFTER INSERT ON recurring_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_of_vip_signup();

-- Add vip_signup to notification type constraint - include all existing types
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
    AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;

  -- Add constraint with all types including existing ones and new one
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'lead_assignment', 'lead_status', 'task_assignment', 'task_comment',
      'proposal_status', 'system', 'work_order_assignment', 'service_request',
      'punchlist_task', 'task_watcher', 'proposal_message', 'deposit_reminder',
      'proposal_reactivation', 'home_clock', 'late_clock_in', 'auto_clock_out',
      'task', 'punchlist_service_request', 'service_request_created',
      'vip_signup'
    ));
END $$;
