/*
  # Add Recurring Appointments Feature

  1. Changes to appointments table
    - Add recurrence_rule column (JSONB) to store recurrence patterns
    - Add recurrence_parent_id to link recurring instances to parent
    - Add is_recurring_parent flag

  2. Recurrence Rule Structure (JSONB)
    - frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
    - interval: number (every X days/weeks/months/years)
    - days_of_week: array for weekly recurrence (0-6, Sun-Sat)
    - day_of_month: number for monthly recurrence
    - end_date: when to stop creating instances
    - occurrences: max number of occurrences (alternative to end_date)

  3. Function
    - generate_recurring_appointments() - Creates appointment instances based on recurrence rules
*/

-- Add recurrence columns to appointments table
DO $$
BEGIN
  -- Add recurrence_rule column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE appointments ADD COLUMN recurrence_rule JSONB DEFAULT NULL;
  END IF;

  -- Add recurrence_parent_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'recurrence_parent_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN recurrence_parent_id UUID REFERENCES appointments(id) ON DELETE CASCADE;
  END IF;

  -- Add is_recurring_parent flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'is_recurring_parent'
  ) THEN
    ALTER TABLE appointments ADD COLUMN is_recurring_parent BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for recurring appointments
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_parent
  ON appointments(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_is_recurring_parent
  ON appointments(is_recurring_parent)
  WHERE is_recurring_parent = true;

-- Function to generate recurring appointment instances
CREATE OR REPLACE FUNCTION generate_recurring_appointments(
  parent_appointment_id UUID,
  generate_until DATE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  parent_apt RECORD;
  rule JSONB;
  frequency TEXT;
  interval_val INTEGER;
  end_date DATE;
  max_occurrences INTEGER;
  next_date DATE;
  instance_count INTEGER := 0;
  new_date DATE;
  days_of_week INTEGER[];
  day_of_month INTEGER;
  i INTEGER;
BEGIN
  -- Get parent appointment
  SELECT * INTO parent_apt
  FROM appointments
  WHERE id = parent_appointment_id
    AND is_recurring_parent = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent appointment not found or not marked as recurring';
  END IF;

  rule := parent_apt.recurrence_rule;
  frequency := rule->>'frequency';
  interval_val := COALESCE((rule->>'interval')::INTEGER, 1);

  -- Determine end date
  IF rule->>'end_date' IS NOT NULL THEN
    end_date := (rule->>'end_date')::DATE;
  ELSIF generate_until IS NOT NULL THEN
    end_date := generate_until;
  ELSE
    -- Default to 1 year from parent appointment
    end_date := parent_apt.appointment_date + INTERVAL '1 year';
  END IF;

  max_occurrences := (rule->>'occurrences')::INTEGER;
  next_date := parent_apt.appointment_date +
    CASE frequency
      WHEN 'daily' THEN (interval_val || ' days')::INTERVAL
      WHEN 'weekly' THEN (interval_val || ' weeks')::INTERVAL
      WHEN 'monthly' THEN (interval_val || ' months')::INTERVAL
      WHEN 'yearly' THEN (interval_val || ' years')::INTERVAL
    END;

  -- For weekly recurrence, get days of week
  IF frequency = 'weekly' AND rule->'days_of_week' IS NOT NULL THEN
    SELECT ARRAY_AGG((value::TEXT)::INTEGER)
    INTO days_of_week
    FROM jsonb_array_elements(rule->'days_of_week');
  END IF;

  -- For monthly recurrence, get day of month
  IF frequency = 'monthly' THEN
    day_of_month := COALESCE((rule->>'day_of_month')::INTEGER, EXTRACT(DAY FROM parent_apt.appointment_date)::INTEGER);
  END IF;

  -- Generate instances
  WHILE next_date <= end_date LOOP
    -- Check max occurrences
    IF max_occurrences IS NOT NULL AND instance_count >= max_occurrences THEN
      EXIT;
    END IF;

    -- For weekly recurrence, check if current day is in allowed days
    IF frequency = 'weekly' AND days_of_week IS NOT NULL THEN
      IF EXTRACT(DOW FROM next_date)::INTEGER = ANY(days_of_week) THEN
        new_date := next_date;
      ELSE
        -- Skip to next interval
        next_date := next_date + (interval_val || ' weeks')::INTERVAL;
        CONTINUE;
      END IF;
    ELSIF frequency = 'monthly' THEN
      -- Set to specific day of month
      new_date := DATE_TRUNC('month', next_date) + (day_of_month - 1 || ' days')::INTERVAL;
      IF new_date > end_date THEN
        EXIT;
      END IF;
    ELSE
      new_date := next_date;
    END IF;

    -- Check if appointment already exists for this date
    IF NOT EXISTS (
      SELECT 1 FROM appointments
      WHERE recurrence_parent_id = parent_appointment_id
        AND appointment_date = new_date
    ) THEN
      -- Create new appointment instance
      INSERT INTO appointments (
        company_id,
        title,
        description,
        appointment_date,
        start_time,
        end_time,
        contact_id,
        project_id,
        technician_id,
        status,
        recurrence_parent_id,
        is_recurring_parent
      ) VALUES (
        parent_apt.company_id,
        parent_apt.title,
        parent_apt.description,
        new_date,
        parent_apt.start_time,
        parent_apt.end_time,
        parent_apt.contact_id,
        parent_apt.project_id,
        parent_apt.technician_id,
        'scheduled',
        parent_appointment_id,
        false
      );

      instance_count := instance_count + 1;
    END IF;

    -- Move to next occurrence
    next_date := next_date +
      CASE frequency
        WHEN 'daily' THEN (interval_val || ' days')::INTERVAL
        WHEN 'weekly' THEN (interval_val || ' weeks')::INTERVAL
        WHEN 'monthly' THEN (interval_val || ' months')::INTERVAL
        WHEN 'yearly' THEN (interval_val || ' years')::INTERVAL
      END;
  END LOOP;

  RETURN instance_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically generate recurring appointments when parent is created
CREATE OR REPLACE FUNCTION trigger_generate_recurring_appointments()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring_parent = true AND NEW.recurrence_rule IS NOT NULL THEN
    PERFORM generate_recurring_appointments(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_recurring_appointment_created ON appointments;
CREATE TRIGGER on_recurring_appointment_created
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.is_recurring_parent = true)
  EXECUTE FUNCTION trigger_generate_recurring_appointments();

-- Function to update all future instances when parent is updated
CREATE OR REPLACE FUNCTION update_recurring_instances()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update future instances
  UPDATE appointments
  SET
    title = NEW.title,
    description = NEW.description,
    start_time = NEW.start_time,
    end_time = NEW.end_time,
    technician_id = NEW.technician_id
  WHERE recurrence_parent_id = NEW.id
    AND appointment_date >= CURRENT_DATE
    AND status = 'scheduled';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_recurring_parent_updated ON appointments;
CREATE TRIGGER on_recurring_parent_updated
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (NEW.is_recurring_parent = true)
  EXECUTE FUNCTION update_recurring_instances();
