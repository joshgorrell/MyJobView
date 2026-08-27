/*
  # Add SMS Reminder Functionality (idempotent)
*/
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'mobile_phone') THEN
    ALTER TABLE contacts ADD COLUMN mobile_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'sms_opt_in') THEN
    ALTER TABLE contacts ADD COLUMN sms_opt_in BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_sent_at') THEN
    ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_status') THEN
    ALTER TABLE appointments ADD COLUMN reminder_status TEXT DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'send_reminder') THEN
    ALTER TABLE appointments ADD COLUMN send_reminder BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_hours_before') THEN
    ALTER TABLE appointments ADD COLUMN reminder_hours_before INTEGER DEFAULT 24;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  external_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sms logs for their contacts" ON sms_logs;
CREATE POLICY "Users can view sms logs for their contacts"
  ON sms_logs FOR SELECT TO authenticated
  USING (contact_id IN (SELECT id FROM contacts WHERE EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())));

CREATE INDEX IF NOT EXISTS idx_sms_logs_contact ON sms_logs(contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_appointment ON sms_logs(appointment_id);

CREATE OR REPLACE FUNCTION get_appointments_needing_reminders()
RETURNS TABLE (appointment_id UUID, contact_name TEXT, contact_phone TEXT, appointment_datetime TIMESTAMPTZ, title TEXT, hours_before INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, CONCAT(c.first_name, ' ', c.last_name), c.mobile_phone, (a.appointment_date + a.start_time::TIME)::TIMESTAMPTZ, a.title, a.reminder_hours_before
  FROM appointments a INNER JOIN contacts c ON a.contact_id = c.id
  WHERE a.send_reminder = true AND a.reminder_status = 'pending' AND a.status = 'scheduled'
    AND c.mobile_phone IS NOT NULL AND c.sms_opt_in = true
    AND (a.appointment_date + a.start_time::TIME)::TIMESTAMPTZ > now()
    AND (a.appointment_date + a.start_time::TIME)::TIMESTAMPTZ <= (now() + (a.reminder_hours_before || ' hours')::INTERVAL)
  ORDER BY a.appointment_date, a.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_reminder_sent(p_appointment_id UUID, p_status TEXT DEFAULT 'sent', p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE appointments SET reminder_sent_at = now(), reminder_status = p_status WHERE id = p_appointment_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_sms(p_contact_id UUID, p_appointment_id UUID, p_to_phone TEXT, p_message TEXT, p_status TEXT DEFAULT 'sent', p_external_id TEXT DEFAULT NULL, p_error TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE v_log_id UUID;
BEGIN
  INSERT INTO sms_logs (contact_id, appointment_id, to_phone, message, status, external_message_id, error)
  VALUES (p_contact_id, p_appointment_id, p_to_phone, p_message, p_status, p_external_id, p_error) RETURNING id INTO v_log_id;
  IF p_appointment_id IS NOT NULL THEN PERFORM mark_reminder_sent(p_appointment_id, p_status, p_error); END IF;
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;