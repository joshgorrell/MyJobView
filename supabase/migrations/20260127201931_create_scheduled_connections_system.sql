/*
  # Create Scheduled Connections System

  1. New Tables
    - `scheduled_connections`
      - Stores recurring connection schedules for prospects (sales/BD only)
      - Supports flexible scheduling (with or without specific times)
      - Supports various recurrence patterns (weekly, monthly, quarterly, custom)

    - `scheduled_connection_occurrences`
      - Individual instances generated from schedules
      - Tracks completion status and rollover history
      - Links to actual connections when completed

  2. Changes
    - Update contacts table to support 'prospect' contact_type
    - Add is_prospect flag for easy filtering

  3. Security
    - Enable RLS on both tables
    - Restrict access to sales and bd roles only
    - Users can only see their own scheduled connections

  4. Functions
    - generate_scheduled_occurrences() - Creates future occurrences
    - rollover_incomplete_occurrences() - Moves uncompleted items to today
    - calculate_next_occurrence_date() - Smart date calculation

  5. Indexes
    - Performance indexes on common query patterns
*/

-- Update contacts constraint to allow 'prospect' type
DO $$
BEGIN
  ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_contact_type_check;

  ALTER TABLE contacts
  ADD CONSTRAINT contacts_contact_type_check
  CHECK (contact_type IN ('person', 'business', 'lead', 'prospect'));
END $$;

-- Add is_prospect flag to contacts for easy filtering
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_prospect boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_is_prospect ON contacts(is_prospect) WHERE is_prospect = true;

-- Update existing prospects (contacts with recurring connections or specific tags)
UPDATE contacts
SET is_prospect = true
WHERE contact_type IN ('lead', 'prospect');

-- Create scheduled_connections table
CREATE TABLE IF NOT EXISTS scheduled_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connection_type text NOT NULL CHECK (connection_type IN ('call', 'email', 'meeting', 'site_visit', 'check_in', 'other')),

  -- Recurrence pattern
  recurrence_pattern text NOT NULL CHECK (recurrence_pattern IN ('one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annually', 'annually', 'custom')),
  recurrence_interval integer DEFAULT 1 CHECK (recurrence_interval > 0), -- For custom patterns (e.g., every 4 months)
  recurrence_day_rule text, -- 'first_monday', 'last_friday', '15th', 'monday', 'tuesday', etc., null for flexible

  -- Schedule dates
  schedule_start_date date NOT NULL,
  schedule_end_date date, -- null for ongoing

  -- Time settings
  is_time_specific boolean DEFAULT false,
  preferred_time time, -- nullable for all-day appointments

  -- Template data
  default_notes text,
  default_location text,

  -- Status
  is_active boolean DEFAULT true,
  last_occurrence_date date,
  next_occurrence_date date,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create scheduled_connection_occurrences table
CREATE TABLE IF NOT EXISTS scheduled_connection_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_connection_id uuid NOT NULL REFERENCES scheduled_connections(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Scheduling info
  scheduled_date date NOT NULL,
  scheduled_time time, -- null for all-day

  -- Completion tracking
  connection_id uuid REFERENCES connections(id) ON DELETE SET NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamptz,

  -- Rollover tracking
  is_rolled_over boolean DEFAULT false,
  original_scheduled_date date,
  rollover_count integer DEFAULT 0,

  -- Skip tracking
  is_skipped boolean DEFAULT false,
  skipped_at timestamptz,
  skipped_reason text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for scheduled_connections
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_prospect ON scheduled_connections(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_created_by ON scheduled_connections(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_active ON scheduled_connections(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_connections_next_occurrence ON scheduled_connections(next_occurrence_date) WHERE is_active = true;

-- Indexes for scheduled_connection_occurrences
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_schedule ON scheduled_connection_occurrences(scheduled_connection_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_prospect ON scheduled_connection_occurrences(prospect_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_date ON scheduled_connection_occurrences(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_pending ON scheduled_connection_occurrences(scheduled_date, is_completed) WHERE is_completed = false AND is_skipped = false;
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_completed ON scheduled_connection_occurrences(is_completed, completed_at) WHERE is_completed = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_occurrences_rolled_over ON scheduled_connection_occurrences(is_rolled_over) WHERE is_rolled_over = true;

-- Enable RLS
ALTER TABLE scheduled_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_connection_occurrences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_connections
CREATE POLICY "Users can view own scheduled connections"
  ON scheduled_connections FOR SELECT
  TO authenticated
  USING (created_by_user_id = auth.uid());

CREATE POLICY "Sales and BD can create scheduled connections"
  ON scheduled_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('sales', 'bd', 'admin')
    )
  );

CREATE POLICY "Users can update own scheduled connections"
  ON scheduled_connections FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can delete own scheduled connections"
  ON scheduled_connections FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- RLS Policies for scheduled_connection_occurrences
CREATE POLICY "Users can view occurrences from own schedules"
  ON scheduled_connection_occurrences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_connections
      WHERE id = scheduled_connection_occurrences.scheduled_connection_id
      AND created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "System can create occurrences"
  ON scheduled_connection_occurrences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheduled_connections
      WHERE id = scheduled_connection_occurrences.scheduled_connection_id
      AND created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update occurrences from own schedules"
  ON scheduled_connection_occurrences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_connections
      WHERE id = scheduled_connection_occurrences.scheduled_connection_id
      AND created_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheduled_connections
      WHERE id = scheduled_connection_occurrences.scheduled_connection_id
      AND created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete occurrences from own schedules"
  ON scheduled_connection_occurrences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_connections
      WHERE id = scheduled_connection_occurrences.scheduled_connection_id
      AND created_by_user_id = auth.uid()
    )
  );

-- Function to calculate next occurrence date based on pattern
CREATE OR REPLACE FUNCTION calculate_next_occurrence_date(
  p_current_date date,
  p_pattern text,
  p_interval integer,
  p_day_rule text
) RETURNS date AS $$
DECLARE
  v_next_date date;
  v_day_of_week integer;
  v_target_day integer;
BEGIN
  CASE p_pattern
    WHEN 'weekly' THEN
      IF p_day_rule IS NULL THEN
        v_next_date := p_current_date + (7 * p_interval);
      ELSE
        -- Get target day (0=Sunday, 6=Saturday)
        v_target_day := CASE p_day_rule
          WHEN 'sunday' THEN 0
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
          WHEN 'saturday' THEN 6
          ELSE EXTRACT(DOW FROM p_current_date)::integer
        END;

        v_next_date := p_current_date + (7 * p_interval);
        v_day_of_week := EXTRACT(DOW FROM v_next_date)::integer;

        -- Adjust to target day
        IF v_day_of_week != v_target_day THEN
          v_next_date := v_next_date + (v_target_day - v_day_of_week + 7) % 7;
        END IF;
      END IF;

    WHEN 'biweekly' THEN
      v_next_date := p_current_date + 14;

    WHEN 'monthly' THEN
      IF p_day_rule IS NULL OR p_day_rule = '' THEN
        -- Same day next month
        v_next_date := p_current_date + INTERVAL '1 month' * p_interval;
      ELSIF p_day_rule ~ '^\d+$' THEN
        -- Specific day of month (e.g., '15th')
        v_next_date := (DATE_TRUNC('month', p_current_date) + INTERVAL '1 month' * p_interval)::date + (p_day_rule::integer - 1);
      ELSIF p_day_rule = 'first_monday' THEN
        v_next_date := DATE_TRUNC('month', p_current_date + INTERVAL '1 month' * p_interval)::date;
        v_day_of_week := EXTRACT(DOW FROM v_next_date)::integer;
        v_next_date := v_next_date + ((1 - v_day_of_week + 7) % 7);
      ELSIF p_day_rule = 'first_tuesday' THEN
        v_next_date := DATE_TRUNC('month', p_current_date + INTERVAL '1 month' * p_interval)::date;
        v_day_of_week := EXTRACT(DOW FROM v_next_date)::integer;
        v_next_date := v_next_date + ((2 - v_day_of_week + 7) % 7);
      ELSIF p_day_rule = 'first_friday' THEN
        v_next_date := DATE_TRUNC('month', p_current_date + INTERVAL '1 month' * p_interval)::date;
        v_day_of_week := EXTRACT(DOW FROM v_next_date)::integer;
        v_next_date := v_next_date + ((5 - v_day_of_week + 7) % 7);
      ELSE
        v_next_date := p_current_date + INTERVAL '1 month' * p_interval;
      END IF;

    WHEN 'quarterly' THEN
      v_next_date := p_current_date + INTERVAL '3 months';

    WHEN 'semi_annually' THEN
      v_next_date := p_current_date + INTERVAL '6 months';

    WHEN 'annually' THEN
      v_next_date := p_current_date + INTERVAL '1 year';

    WHEN 'custom' THEN
      -- Custom interval in months
      v_next_date := p_current_date + (INTERVAL '1 month' * p_interval);

    ELSE
      v_next_date := p_current_date + 1;
  END CASE;

  RETURN v_next_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate scheduled occurrences (run daily)
CREATE OR REPLACE FUNCTION generate_scheduled_occurrences()
RETURNS void AS $$
DECLARE
  v_schedule RECORD;
  v_next_date date;
  v_end_date date;
  v_count integer;
BEGIN
  v_end_date := CURRENT_DATE + 90; -- Generate 90 days in advance

  FOR v_schedule IN
    SELECT * FROM scheduled_connections
    WHERE is_active = true
    AND (schedule_end_date IS NULL OR schedule_end_date >= CURRENT_DATE)
  LOOP
    -- Start from next_occurrence_date or last_occurrence_date
    v_next_date := COALESCE(
      v_schedule.next_occurrence_date,
      v_schedule.last_occurrence_date,
      v_schedule.schedule_start_date
    );

    -- If we already have occurrences, start from the next one
    IF v_schedule.last_occurrence_date IS NOT NULL THEN
      v_next_date := calculate_next_occurrence_date(
        v_next_date,
        v_schedule.recurrence_pattern,
        v_schedule.recurrence_interval,
        v_schedule.recurrence_day_rule
      );
    END IF;

    v_count := 0;

    -- Generate occurrences up to end_date
    WHILE v_next_date <= v_end_date
      AND (v_schedule.schedule_end_date IS NULL OR v_next_date <= v_schedule.schedule_end_date)
      AND v_count < 100 -- Safety limit
    LOOP
      -- Check if occurrence already exists
      IF NOT EXISTS (
        SELECT 1 FROM scheduled_connection_occurrences
        WHERE scheduled_connection_id = v_schedule.id
        AND scheduled_date = v_next_date
      ) THEN
        -- Create the occurrence
        INSERT INTO scheduled_connection_occurrences (
          scheduled_connection_id,
          prospect_id,
          scheduled_date,
          scheduled_time,
          original_scheduled_date
        ) VALUES (
          v_schedule.id,
          v_schedule.prospect_id,
          v_next_date,
          v_schedule.preferred_time,
          v_next_date
        );

        -- Update schedule's next occurrence date
        UPDATE scheduled_connections
        SET
          next_occurrence_date = v_next_date,
          last_occurrence_date = v_next_date,
          updated_at = now()
        WHERE id = v_schedule.id;
      END IF;

      -- Calculate next date
      v_next_date := calculate_next_occurrence_date(
        v_next_date,
        v_schedule.recurrence_pattern,
        v_schedule.recurrence_interval,
        v_schedule.recurrence_day_rule
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rollover incomplete occurrences (run daily)
CREATE OR REPLACE FUNCTION rollover_incomplete_occurrences()
RETURNS void AS $$
DECLARE
  v_occurrence RECORD;
BEGIN
  FOR v_occurrence IN
    SELECT * FROM scheduled_connection_occurrences
    WHERE scheduled_date < CURRENT_DATE
    AND is_completed = false
    AND is_skipped = false
    AND rollover_count < 7 -- Max 7 days of rollover
  LOOP
    -- Update the occurrence to today
    UPDATE scheduled_connection_occurrences
    SET
      scheduled_date = CURRENT_DATE,
      is_rolled_over = true,
      rollover_count = rollover_count + 1,
      original_scheduled_date = COALESCE(original_scheduled_date, scheduled_date),
      updated_at = now()
    WHERE id = v_occurrence.id;
  END LOOP;

  -- Mark old occurrences as missed if rolled over too many times
  UPDATE scheduled_connection_occurrences
  SET
    is_skipped = true,
    skipped_reason = 'Automatically marked as missed after 7 days',
    skipped_at = now()
  WHERE scheduled_date < CURRENT_DATE - 7
    AND is_completed = false
    AND is_skipped = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update scheduled_connections.updated_at
CREATE OR REPLACE FUNCTION update_scheduled_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_connections_updated_at
  BEFORE UPDATE ON scheduled_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_connections_updated_at();

-- Trigger to update scheduled_connection_occurrences.updated_at
CREATE OR REPLACE FUNCTION update_scheduled_occurrences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_occurrences_updated_at
  BEFORE UPDATE ON scheduled_connection_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_occurrences_updated_at();

-- Comment on tables and columns
COMMENT ON TABLE scheduled_connections IS 'Recurring connection schedules for prospects (sales/BD only)';
COMMENT ON TABLE scheduled_connection_occurrences IS 'Individual occurrences generated from scheduled connections';
COMMENT ON COLUMN scheduled_connections.is_time_specific IS 'If false, shows as all-day event at top of calendar';
COMMENT ON COLUMN scheduled_connections.recurrence_day_rule IS 'Flexible day rules like "first_monday", "15th", or specific day names';
COMMENT ON COLUMN scheduled_connection_occurrences.is_rolled_over IS 'True if this occurrence was moved from a previous date';
COMMENT ON COLUMN scheduled_connection_occurrences.rollover_count IS 'Number of times this occurrence has been rolled forward';
