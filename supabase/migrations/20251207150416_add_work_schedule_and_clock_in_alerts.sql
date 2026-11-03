/*\n  # Add Work Schedule and Clock-In Alert System\n\n  1. Changes\n    - Add work_days array to profiles (e.g., ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])\n    - Create time_clock_alerts table for tracking late/missing clock-ins\n    - Add function to automatically create alerts for late or missing clock-ins\n    \n  2. Security\n    - Enable RLS on time_clock_alerts table\n    - Managers and admins can view all alerts\n    - Technicians can view their own alerts\n*/\n\n-- Add work_days to profiles (default to Monday-Friday)\nDO $$ \nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns \n    WHERE table_name = 'profiles' AND column_name = 'work_days'\n  ) THEN\n    ALTER TABLE profiles \n    ADD COLUMN work_days text[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

\n  END IF

\nEND $$

\n\n-- Create time_clock_alerts table\nCREATE TABLE IF NOT EXISTS time_clock_alerts (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  technician_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,\n  alert_date date NOT NULL,\n  alert_type text NOT NULL CHECK (alert_type IN ('really_late', 'missing', 'no_show')),\n  scheduled_start_time time NOT NULL,\n  actual_clock_in_time time,\n  minutes_late integer,\n  resolved boolean DEFAULT false,\n  resolved_at timestamptz,\n  resolved_by uuid REFERENCES profiles(id),\n  resolution_notes text,\n  notification_sent boolean DEFAULT false,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)

\n\n-- Create indexes\nCREATE INDEX IF NOT EXISTS idx_time_clock_alerts_technician ON time_clock_alerts(technician_id)

\nCREATE INDEX IF NOT EXISTS idx_time_clock_alerts_date ON time_clock_alerts(alert_date)

\nCREATE INDEX IF NOT EXISTS idx_time_clock_alerts_resolved ON time_clock_alerts(resolved)

\nCREATE INDEX IF NOT EXISTS idx_time_clock_alerts_type ON time_clock_alerts(alert_type)

\n\n-- Enable RLS\nALTER TABLE time_clock_alerts ENABLE ROW LEVEL SECURITY

\n\n-- RLS Policies\nCREATE POLICY "Managers and admins can view all alerts"\n  ON time_clock_alerts FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')\n    )\n  )

\n\nCREATE POLICY "Technicians can view own alerts"\n  ON time_clock_alerts FOR SELECT\n  TO authenticated\n  USING (technician_id = auth.uid())

\n\nCREATE POLICY "Managers can update alerts"\n  ON time_clock_alerts FOR UPDATE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'service_manager')\n    )\n  )

\n\nCREATE POLICY "System can create alerts"\n  ON time_clock_alerts FOR INSERT\n  TO authenticated\n  WITH CHECK (true)

\n\n-- Function to check if technician should be working today\nCREATE OR REPLACE FUNCTION is_working_today(tech_id uuid, check_date date)\nRETURNS boolean AS $$\nDECLARE\n  day_name text

\n  tech_work_days text[]

\nBEGIN\n  -- Get day of week name in lowercase\n  day_name := lower(to_char(check_date, 'Day'))

\n  day_name := trim(day_name)

\n  \n  -- Get technician's work days\n  SELECT work_days INTO tech_work_days\n  FROM profiles\n  WHERE id = tech_id

\n  \n  -- Check if today is a work day\n  RETURN day_name = ANY(tech_work_days)

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\n-- Function to create alert for really late clock-in\nCREATE OR REPLACE FUNCTION check_late_clock_in()\nRETURNS trigger AS $$\nDECLARE\n  tech_start_time time

\n  minutes_diff integer

\n  alert_exists boolean

\nBEGIN\n  -- Get technician's scheduled start time\n  SELECT standard_start_time INTO tech_start_time\n  FROM profiles\n  WHERE id = NEW.technician_id

\n  \n  -- If no standard start time, skip\n  IF tech_start_time IS NULL THEN\n    RETURN NEW

\n  END IF

\n  \n  -- Calculate minutes late\n  minutes_diff := EXTRACT(EPOCH FROM (NEW.clock_in::time - tech_start_time)) / 60

\n  \n  -- If more than 15 minutes late, create alert\n  IF minutes_diff > 15 THEN\n    -- Check if alert already exists for this date\n    SELECT EXISTS(\n      SELECT 1 FROM time_clock_alerts\n      WHERE technician_id = NEW.technician_id\n      AND alert_date = NEW.entry_date\n      AND alert_type = 'really_late'\n    ) INTO alert_exists

\n    \n    -- Only create if it doesn't exist\n    IF NOT alert_exists THEN\n      INSERT INTO time_clock_alerts (\n        technician_id,\n        alert_date,\n        alert_type,\n        scheduled_start_time,\n        actual_clock_in_time,\n        minutes_late\n      ) VALUES (\n        NEW.technician_id,\n        NEW.entry_date,\n        'really_late',\n        tech_start_time,\n        NEW.clock_in::time,\n        minutes_diff::integer\n      )

\n    END IF

\n  END IF

\n  \n  RETURN NEW

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\n-- Create trigger for late clock-ins\nDROP TRIGGER IF EXISTS trigger_check_late_clock_in ON daily_clock_entries

\nCREATE TRIGGER trigger_check_late_clock_in\n  AFTER INSERT ON daily_clock_entries\n  FOR EACH ROW\n  EXECUTE FUNCTION check_late_clock_in()

\n\n-- Grant necessary permissions\nGRANT USAGE ON SCHEMA public TO authenticated

\nGRANT SELECT ON time_clock_alerts TO authenticated

\nGRANT INSERT, UPDATE ON time_clock_alerts TO authenticated

\n
