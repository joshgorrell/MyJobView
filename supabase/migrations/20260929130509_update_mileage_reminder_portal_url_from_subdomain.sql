/*
# Update mileage reminder to use subdomain-based portal URL

## Purpose
The mileage reminder scheduled job sends emails with a `portal_url` link.
Previously it read `portal_url` directly from `company_settings`, which could
be stale or empty now that portal URLs are auto-derived from the dealer's
subdomain. This update makes the function check `organizations.subdomain`
first and build `https://{subdomain}.myjobview.com` when present, falling
back to `company_settings.portal_url` only when no subdomain is set.

## Changes
- Recreates the `send_mileage_reminder_emails()` function with updated
  portal URL resolution logic.
- No schema changes, no new tables, no RLS changes.
*/

CREATE OR REPLACE FUNCTION send_mileage_reminder_emails()
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
  v_last_entry_date text;
  v_vehicle_info text;
  v_last_mileage integer;
  v_user_email text;
  v_user_full_name text;
  v_portal_url text;
  v_company_name text;
  v_subdomain text;
BEGIN
  -- Get company settings + organization subdomain
  SELECT
    COALESCE(cs.portal_url, 'https://yourcompany.com/portal'),
    COALESCE(cs.name, 'Company'),
    o.subdomain
  INTO v_portal_url, v_company_name, v_subdomain
  FROM company_settings cs
  LEFT JOIN organizations o ON true
  LIMIT 1;

  -- Override portal URL with subdomain-based URL when available
  IF v_subdomain IS NOT NULL AND v_subdomain != '' THEN
    v_portal_url := 'https://' || v_subdomain || '.myjobview.com';
  END IF;

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
