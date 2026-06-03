-- Create function to send mileage reminders
CREATE OR REPLACE FUNCTION send_mileage_reminders()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user record;
  v_vehicle_info text;
  v_days_since integer;
BEGIN
  -- Loop through users needing reminders (90 days or more since last entry)
  FOR v_user IN
    SELECT 
      user_id,
      vehicle_id,
      vehicle_info,
      days_since_last_entry
    FROM get_users_needing_mileage_reminders()
  LOOP
    -- Check if a reminder already exists for this user/vehicle combination
    IF NOT EXISTS (
      SELECT 1 FROM mileage_reminders
      WHERE user_id = v_user.user_id
      AND vehicle_id = v_user.vehicle_id
      AND status IN ('pending', 'sent')
      AND due_date >= CURRENT_DATE - INTERVAL '7 days'
    ) THEN
      -- Create reminder
      INSERT INTO mileage_reminders (user_id, vehicle_id, due_date, status)
      VALUES (
        v_user.user_id,
        v_user.vehicle_id,
        CURRENT_DATE,
        'pending'
      );

      -- Determine notification status
      IF v_user.days_since_last_entry >= 97 THEN
        -- 7 days overdue - escalation notification
        INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
        VALUES (
          v_user.user_id,
          'system',
          'Mileage Entry OVERDUE',
          'Your mileage entry for ' || v_user.vehicle_info || ' is overdue by ' || (v_user.days_since_last_entry - 90) || ' days. Please submit immediately.',
          v_user.vehicle_id::text,
          'mileage_reminder'
        );

        -- Update reminder status to overdue
        UPDATE mileage_reminders
        SET status = 'overdue'
        WHERE user_id = v_user.user_id
        AND vehicle_id = v_user.vehicle_id
        AND status IN ('pending', 'sent');

      ELSIF v_user.days_since_last_entry >= 90 THEN
        -- Just hit 90 days - standard reminder
        INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
        VALUES (
          v_user.user_id,
          'system',
          'Quarterly Mileage Entry Due',
          'Please submit your mileage reading for ' || v_user.vehicle_info || '. It has been ' || v_user.days_since_last_entry || ' days since your last entry.',
          v_user.vehicle_id::text,
          'mileage_reminder'
        );

        -- Mark reminder as sent
        UPDATE mileage_reminders
        SET status = 'sent',
            reminder_sent_at = now()
        WHERE user_id = v_user.user_id
        AND vehicle_id = v_user.vehicle_id
        AND status = 'pending';

      ELSIF v_user.days_since_last_entry >= 83 THEN
        -- 7 days before due - advance notice
        INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
        VALUES (
          v_user.user_id,
          'system',
          'Mileage Entry Reminder',
          'Your quarterly mileage entry for ' || v_user.vehicle_info || ' will be due in ' || (90 - v_user.days_since_last_entry) || ' days.',
          v_user.vehicle_id::text,
          'mileage_reminder'
        );
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Mileage reminders processed successfully';
END;
$$;

-- Schedule the job to run daily at 8:00 AM
-- Note: pg_cron uses server time, adjust as needed
SELECT cron.schedule(
  'send-mileage-reminders',
  '0 8 * * *',
  $$SELECT send_mileage_reminders();$$
);