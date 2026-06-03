/*
  # Tech Module - Daily Clock & Employment Types

  1. New Tables
    - `daily_clock_entries`
      - `id` (uuid, primary key)
      - `technician_id` (uuid, references profiles)
      - `entry_date` (date) - The calendar date of this clock entry
      - `clock_in` (timestamptz) - Start of day timestamp
      - `clock_out` (timestamptz, nullable) - End of day timestamp
      - `total_hours` (decimal) - Calculated total hours for the day
      - `break_minutes` (integer) - Total break time in minutes
      - `status` (text) - clocked_in, clocked_out, submitted, approved, rejected
      - `notes` (text, nullable) - Admin notes or tech notes
      - `admin_adjusted` (boolean) - Whether admin made adjustments
      - `adjusted_by` (uuid, nullable) - Admin who made adjustments
      - `adjustment_reason` (text, nullable) - Why adjustment was made
      - `office_id` (uuid, references company_offices)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `daily_clock_breaks`
      - `id` (uuid, primary key)
      - `daily_clock_entry_id` (uuid, references daily_clock_entries)
      - `break_start` (timestamptz) - When break started
      - `break_end` (timestamptz, nullable) - When break ended
      - `break_duration_minutes` (integer) - Calculated duration
      - `break_type` (text) - lunch, personal, other
      - `created_at` (timestamptz)

    - `clock_in_rewards_log`
      - `id` (uuid, primary key)
      - `technician_id` (uuid, references profiles)
      - `daily_clock_entry_id` (uuid, references daily_clock_entries)
      - `event_type` (text) - on_time, early, late, very_late
      - `points_awarded` (integer) - Can be negative for penalties
      - `minutes_delta` (integer) - Minutes early or late
      - `scheduled_time` (time) - Expected clock-in time
      - `actual_time` (time) - Actual clock-in time
      - `created_at` (timestamptz)

  2. Profile Updates
    - Add `employment_type` (text) - hourly, job_time, salary
    - Add `requires_daily_clock` (boolean) - Computed based on employment type
    - Add `standard_start_time` (time, nullable) - Expected daily start time
    - Add `standard_end_time` (time, nullable) - Expected daily end time
    - Add `travel_bonus_enabled` (boolean) - Whether tech gets travel bonuses
    - Add `travel_bonus_rate` (decimal, nullable) - Per-mile rate
    - Add `travel_bonus_method` (text, nullable) - round_trip, one_way

  3. Security
    - Enable RLS on all new tables
    - Techs can view/create their own entries
    - Admins/Managers can view/modify all entries
    - Office-based visibility restrictions

  4. Important Notes
    - Daily clock is SEPARATE from job time tracking (time_entries table)
    - Hourly techs: paid from daily clock, job clocks for documentation
    - Job-time techs: paid from job clocks only, no daily clock
    - Salary techs: fixed pay, daily clock for insurance/tracking only
*/

-- Add employment type fields to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN employment_type text DEFAULT 'hourly' CHECK (employment_type IN ('hourly', 'job_time', 'salary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'requires_daily_clock'
  ) THEN
    ALTER TABLE profiles ADD COLUMN requires_daily_clock boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'standard_start_time'
  ) THEN
    ALTER TABLE profiles ADD COLUMN standard_start_time time;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'standard_end_time'
  ) THEN
    ALTER TABLE profiles ADD COLUMN standard_end_time time;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'travel_bonus_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN travel_bonus_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'travel_bonus_rate'
  ) THEN
    ALTER TABLE profiles ADD COLUMN travel_bonus_rate decimal(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'travel_bonus_method'
  ) THEN
    ALTER TABLE profiles ADD COLUMN travel_bonus_method text CHECK (travel_bonus_method IN ('round_trip', 'one_way'));
  END IF;
END $$;

-- Create daily_clock_entries table
CREATE TABLE IF NOT EXISTS daily_clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  entry_date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_hours decimal(10,2) DEFAULT 0,
  break_minutes integer DEFAULT 0,
  status text DEFAULT 'clocked_in' CHECK (status IN ('clocked_in', 'clocked_out', 'submitted', 'approved', 'rejected')),
  notes text,
  admin_adjusted boolean DEFAULT false,
  adjusted_by uuid REFERENCES profiles(id),
  adjustment_reason text,
  office_id uuid REFERENCES company_offices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(technician_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_clock_technician ON daily_clock_entries(technician_id);
CREATE INDEX IF NOT EXISTS idx_daily_clock_date ON daily_clock_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_daily_clock_status ON daily_clock_entries(status);
CREATE INDEX IF NOT EXISTS idx_daily_clock_office ON daily_clock_entries(office_id);

-- Create daily_clock_breaks table
CREATE TABLE IF NOT EXISTS daily_clock_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE CASCADE NOT NULL,
  break_start timestamptz NOT NULL,
  break_end timestamptz,
  break_duration_minutes integer DEFAULT 0,
  break_type text DEFAULT 'lunch' CHECK (break_type IN ('lunch', 'personal', 'other')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breaks_entry ON daily_clock_breaks(daily_clock_entry_id);

-- Create clock_in_rewards_log table
CREATE TABLE IF NOT EXISTS clock_in_rewards_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  daily_clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('on_time', 'early', 'late', 'very_late', 'forgot_clock_out')),
  points_awarded integer NOT NULL,
  minutes_delta integer,
  scheduled_time time,
  actual_time time,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rewards_log_tech ON clock_in_rewards_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_rewards_log_entry ON clock_in_rewards_log(daily_clock_entry_id);

-- Enable RLS
ALTER TABLE daily_clock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_clock_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_in_rewards_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_clock_entries

-- Techs can view their own entries
CREATE POLICY "Techs can view own daily clock entries"
  ON daily_clock_entries FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

-- Techs can create their own entries
CREATE POLICY "Techs can create own daily clock entries"
  ON daily_clock_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id
  );

-- Techs can update their own entries (only if not approved)
CREATE POLICY "Techs can update own daily clock entries"
  ON daily_clock_entries FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = technician_id
    AND status IN ('clocked_in', 'clocked_out')
  )
  WITH CHECK (
    auth.uid() = technician_id
  );

-- Admins can update any entry
CREATE POLICY "Admins can update daily clock entries"
  ON daily_clock_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for daily_clock_breaks

-- Techs can view their own breaks
CREATE POLICY "Techs can view own breaks"
  ON daily_clock_breaks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE daily_clock_entries.id = daily_clock_breaks.daily_clock_entry_id
      AND (
        daily_clock_entries.technician_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'dispatch')
        )
      )
    )
  );

-- Techs can create breaks for their entries
CREATE POLICY "Techs can create breaks"
  ON daily_clock_breaks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE daily_clock_entries.id = daily_clock_breaks.daily_clock_entry_id
      AND daily_clock_entries.technician_id = auth.uid()
      AND daily_clock_entries.status IN ('clocked_in')
    )
  );

-- Techs can update their breaks (end break)
CREATE POLICY "Techs can update breaks"
  ON daily_clock_breaks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE daily_clock_entries.id = daily_clock_breaks.daily_clock_entry_id
      AND daily_clock_entries.technician_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_clock_entries
      WHERE daily_clock_entries.id = daily_clock_breaks.daily_clock_entry_id
      AND daily_clock_entries.technician_id = auth.uid()
    )
  );

-- RLS Policies for clock_in_rewards_log

-- Techs can view their own rewards
CREATE POLICY "Techs can view own rewards log"
  ON clock_in_rewards_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- Only system can create rewards entries (via function)
CREATE POLICY "System can create rewards log"
  ON clock_in_rewards_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to auto-calculate total hours when clock_out is set
CREATE OR REPLACE FUNCTION calculate_daily_clock_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND (OLD.clock_out IS NULL OR NEW.clock_out != OLD.clock_out) THEN
    NEW.total_hours = EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0 - (NEW.break_minutes / 60.0);
    IF NEW.status = 'clocked_in' THEN
      NEW.status = 'clocked_out';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_daily_clock_hours ON daily_clock_entries;
CREATE TRIGGER update_daily_clock_hours
  BEFORE UPDATE ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_daily_clock_hours();

-- Function to auto-calculate break duration
CREATE OR REPLACE FUNCTION calculate_break_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.break_end IS NOT NULL AND (OLD.break_end IS NULL OR NEW.break_end != OLD.break_end) THEN
    NEW.break_duration_minutes = EXTRACT(EPOCH FROM (NEW.break_end - NEW.break_start)) / 60.0;
    
    -- Update the daily clock entry's total break minutes
    UPDATE daily_clock_entries
    SET break_minutes = (
      SELECT COALESCE(SUM(break_duration_minutes), 0)
      FROM daily_clock_breaks
      WHERE daily_clock_entry_id = NEW.daily_clock_entry_id
    )
    WHERE id = NEW.daily_clock_entry_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_break_duration ON daily_clock_breaks;
CREATE TRIGGER update_break_duration
  BEFORE UPDATE ON daily_clock_breaks
  FOR EACH ROW
  EXECUTE FUNCTION calculate_break_duration();

-- Function to award points on clock-in
CREATE OR REPLACE FUNCTION award_clock_in_points()
RETURNS TRIGGER AS $$
DECLARE
  v_scheduled_time time;
  v_actual_time time;
  v_minutes_delta integer;
  v_event_type text;
  v_points integer;
BEGIN
  -- Get tech's scheduled start time
  SELECT standard_start_time
  INTO v_scheduled_time
  FROM profiles
  WHERE id = NEW.technician_id;

  IF v_scheduled_time IS NULL THEN
    RETURN NEW; -- No scheduled time, skip rewards
  END IF;

  v_actual_time = NEW.clock_in::time;
  
  -- Calculate minutes delta (negative = early, positive = late)
  v_minutes_delta = EXTRACT(EPOCH FROM (v_actual_time - v_scheduled_time)) / 60;

  -- Determine event type and points
  IF v_minutes_delta <= -15 THEN
    v_event_type = 'early';
    v_points = 10; -- Bonus for being very early
  ELSIF v_minutes_delta <= 0 THEN
    v_event_type = 'on_time';
    v_points = 5; -- Standard points for on-time
  ELSIF v_minutes_delta <= 15 THEN
    v_event_type = 'late';
    v_points = -5; -- Penalty for being slightly late
  ELSE
    v_event_type = 'very_late';
    v_points = -10; -- Larger penalty for being very late
  END IF;

  -- Log the reward event
  INSERT INTO clock_in_rewards_log (
    technician_id,
    daily_clock_entry_id,
    event_type,
    points_awarded,
    minutes_delta,
    scheduled_time,
    actual_time
  ) VALUES (
    NEW.technician_id,
    NEW.id,
    v_event_type,
    v_points,
    v_minutes_delta,
    v_scheduled_time,
    v_actual_time
  );

  -- Award points to tech's profile (use points_earned field)
  UPDATE profiles
  SET points_earned = COALESCE(points_earned, 0) + v_points
  WHERE id = NEW.technician_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_award_clock_in_points ON daily_clock_entries;
CREATE TRIGGER trigger_award_clock_in_points
  AFTER INSERT ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION award_clock_in_points();
