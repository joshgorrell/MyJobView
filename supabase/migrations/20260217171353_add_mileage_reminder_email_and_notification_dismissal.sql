/*
  # Add Mileage Reminder Email Template and Notification Dismissal

  1. Changes
    - Add email template for mileage reminders
    - Update send_mileage_reminders() to send emails via edge function
    - Update mileage submission trigger to dismiss related notifications

  2. Email Template
    - Template type: mileage_reminder_email
    - Contains vehicle info, days overdue, and portal link
    - Supports multiple urgency levels (advance notice, due, overdue)

  3. Notification Dismissal
    - When mileage is submitted, dismiss all mileage_reminder notifications for that user/vehicle
    - Ensures users don't see stale reminders after reporting
*/

-- Add mileage reminder email template
INSERT INTO email_templates (organization_id, template_type, subject, body, is_active)
SELECT 
  id,
  'mileage_reminder_email',
  'Vehicle Mileage Report {{urgency_label}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a1a !important; color: #ffffff !important; }
      .email-container { background-color: #2d2d2d !important; }
      .header { background-color: #1e40af !important; }
      .content { background-color: #2d2d2d !important; color: #e5e5e5 !important; }
      .info-box { background-color: #374151 !important; color: #e5e5e5 !important; }
      .footer { background-color: #1f1f1f !important; color: #9ca3af !important; }
      .overdue-badge { background-color: #7f1d1d !important; }
      .due-badge { background-color: #854d0e !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f3f4f6;">
  <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div class="header" style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Vehicle Mileage Report {{urgency_label}}</h1>
    </div>

    <div class="content" style="padding: 32px 24px; background-color: #ffffff;">
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
        Hello {{full_name}},
      </p>

      {{urgency_message}}

      <div class="info-box" style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">VEHICLE INFORMATION</p>
        <p style="margin: 0 0 4px 0; color: #111827; font-size: 18px; font-weight: 600;">{{vehicle_info}}</p>
        <p style="margin: 8px 0 4px 0; color: #6b7280; font-size: 14px;">
          <strong>Last Reported:</strong> {{last_entry_date}}
        </p>
        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">
          <strong>Days Since:</strong> {{days_since}} days
        </p>
        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">
          <strong>Last Mileage:</strong> {{last_mileage}} miles
        </p>
      </div>

      <p style="margin: 24px 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
        Please submit your current odometer reading as soon as possible.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="{{portal_url}}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);">Submit Mileage Now</a>
      </div>

      <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
        If you have any questions or need assistance, please contact your fleet manager.
      </p>
    </div>

    <div class="footer" style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        {{company_name}}
      </p>
      <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
        This is an automated reminder. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>',
  true
FROM organizations
LIMIT 1
ON CONFLICT (template_type) DO UPDATE
SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  updated_at = now();

-- Update the send_mileage_reminders function to send emails
CREATE OR REPLACE FUNCTION send_mileage_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reminder RECORD;
  v_days_since integer;
  v_urgency text;
  v_urgency_label text;
  v_urgency_message text;
  v_last_mileage integer;
  v_last_entry_date text;
  v_vehicle_info text;
  v_user_email text;
  v_user_full_name text;
  v_portal_url text;
  v_company_name text;
BEGIN
  -- Get company settings
  SELECT
    COALESCE(portal_url, 'https://yourcompany.com/portal'),
    COALESCE(name, 'Company')
  INTO v_portal_url, v_company_name
  FROM company_settings
  LIMIT 1;

  -- Loop through users who need reminders
  FOR v_reminder IN
    SELECT *
    FROM get_users_needing_mileage_reminders()
  LOOP
    -- Check if reminder already sent today
    IF EXISTS (
      SELECT 1 FROM mileage_reminders
      WHERE user_id = v_reminder.user_id
      AND vehicle_id = v_reminder.vehicle_id
      AND status != 'completed'
      AND DATE(created_at) = CURRENT_DATE
    ) THEN
      CONTINUE;
    END IF;

    -- Calculate days since last entry
    v_days_since := v_reminder.days_since_last_entry;

    -- Determine urgency level and message
    IF v_days_since >= 97 THEN
      v_urgency := 'overdue';
      v_urgency_label := '- OVERDUE';
      v_urgency_message := '<p style="margin: 0 0 16px 0; padding: 16px; background-color: #fee2e2; border-left: 4px solid #dc2626; border-radius: 4px; color: #991b1b; font-size: 16px; line-height: 1.5;"><strong>⚠️ OVERDUE:</strong> Your quarterly mileage report is now overdue. Please submit it immediately to avoid any penalties.</p>';
    ELSIF v_days_since >= 90 THEN
      v_urgency := 'due';
      v_urgency_label := '- Due Today';
      v_urgency_message := '<p style="margin: 0 0 16px 0; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; color: #92400e; font-size: 16px; line-height: 1.5;"><strong>📅 Due Today:</strong> Your quarterly mileage report is due today. Please submit it at your earliest convenience.</p>';
    ELSE
      v_urgency := 'upcoming';
      v_urgency_label := '- Coming Soon';
      v_urgency_message := '<p style="margin: 0 0 16px 0; padding: 16px; background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 4px; color: #1e40af; font-size: 16px; line-height: 1.5;"><strong>📢 Reminder:</strong> Your quarterly mileage report will be due in 7 days. Please plan to submit it soon.</p>';
    END IF;

    -- Get vehicle and user info
    SELECT
      make || ' ' || model || ' (' || license_plate || ')',
      COALESCE(v_reminder.last_mileage, initial_mileage)
    INTO v_vehicle_info, v_last_mileage
    FROM vehicles
    WHERE id = v_reminder.vehicle_id;

    -- Get last entry date
    SELECT COALESCE(TO_CHAR(entry_date, 'Mon DD, YYYY'), 'Never')
    INTO v_last_entry_date
    FROM mileage_entries
    WHERE user_id = v_reminder.user_id
    AND vehicle_id = v_reminder.vehicle_id
    ORDER BY entry_date DESC
    LIMIT 1;

    IF v_last_entry_date IS NULL THEN
      SELECT TO_CHAR(assigned_date, 'Mon DD, YYYY')
      INTO v_last_entry_date
      FROM vehicle_assignments
      WHERE user_id = v_reminder.user_id
      AND vehicle_id = v_reminder.vehicle_id
      AND is_active = true
      LIMIT 1;
    END IF;

    -- Get user info
    SELECT email, full_name
    INTO v_user_email, v_user_full_name
    FROM profiles
    WHERE id = v_reminder.user_id;

    -- Create the reminder record
    INSERT INTO mileage_reminders (user_id, vehicle_id, due_date, status)
    VALUES (v_reminder.user_id, v_reminder.vehicle_id, CURRENT_DATE + INTERVAL '90 days', 'sent')
    ON CONFLICT (user_id, vehicle_id, due_date)
    DO UPDATE SET status = 'sent', updated_at = now();

    -- Create in-app notification
    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        reference_id,
        reference_type
      )
      VALUES (
        v_reminder.user_id,
        'mileage_reminder',
        CASE
          WHEN v_days_since >= 97 THEN 'Mileage Entry OVERDUE'
          WHEN v_days_since >= 90 THEN 'Quarterly Mileage Entry Due'
          ELSE 'Mileage Entry Reminder'
        END,
        'Please report mileage for ' || v_vehicle_info,
        v_reminder.vehicle_id::text,
        'vehicle'
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create notification for user %: %', v_reminder.user_id, SQLERRM;
    END;

    -- Update reminder status
    UPDATE mileage_reminders
    SET status = CASE
      WHEN v_days_since >= 97 THEN 'overdue'
      WHEN v_days_since >= 90 THEN 'sent'
      ELSE 'sent'
    END
    WHERE user_id = v_reminder.user_id
    AND vehicle_id = v_reminder.vehicle_id
    AND status != 'completed';

    -- Send email via edge function
    BEGIN
      PERFORM net.http_post(
        url := (SELECT current_setting('app.supabase_url', true) || '/functions/v1/send-mileage-reminder'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'to_email', v_user_email,
          'full_name', v_user_full_name,
          'vehicle_info', v_vehicle_info,
          'last_entry_date', v_last_entry_date,
          'days_since', v_days_since,
          'last_mileage', v_last_mileage,
          'portal_url', v_portal_url || '?page=mileage',
          'company_name', v_company_name,
          'urgency', v_urgency,
          'urgency_label', v_urgency_label,
          'urgency_message', v_urgency_message
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to send email to %: %', v_user_email, SQLERRM;
    END;

  END LOOP;
END;
$$;

-- Update the mileage entry submission trigger to dismiss notifications
CREATE OR REPLACE FUNCTION handle_mileage_entry_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vehicle_info text;
BEGIN
  -- Get vehicle information
  SELECT make || ' ' || model || ' (' || license_plate || ')'
  INTO v_vehicle_info
  FROM vehicles
  WHERE id = NEW.vehicle_id;

  -- Mark existing reminders as completed
  UPDATE mileage_reminders
  SET status = 'completed',
      entry_submitted_at = now()
  WHERE user_id = NEW.user_id
  AND vehicle_id = NEW.vehicle_id
  AND status IN ('pending', 'sent', 'overdue');

  -- DISMISS/DELETE mileage reminder notifications for this user/vehicle
  DELETE FROM notifications
  WHERE user_id = NEW.user_id
  AND type = 'mileage_reminder'
  AND reference_id = NEW.vehicle_id::text
  AND reference_type = 'vehicle'
  AND read_at IS NULL;

  -- Create next reminder
  PERFORM create_next_mileage_reminder(NEW.user_id, NEW.vehicle_id);

  -- Create notification for admins
  INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
  SELECT
    p.id,
    'system',
    'Mileage Entry Submitted',
    (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' submitted mileage for ' || v_vehicle_info,
    NEW.id::text,
    'mileage_entry'
  FROM profiles p
  WHERE p.role IN ('admin', 'manager');

  RETURN NEW;
END;
$$;

-- Ensure trigger is properly attached (drop and recreate to be safe)
DROP TRIGGER IF EXISTS trigger_handle_mileage_submission ON mileage_entries;

CREATE TRIGGER trigger_handle_mileage_submission
  AFTER INSERT ON mileage_entries
  FOR EACH ROW
  EXECUTE FUNCTION handle_mileage_entry_submission();
