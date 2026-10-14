/*\n  # Add GPS Tracking to Daily Clock Entries\n\n  1. New Columns\n    - `clock_in_latitude` - GPS latitude when clocking in\n    - `clock_in_longitude` - GPS longitude when clocking in\n    - `clock_in_address` - Reverse geocoded address for clock in\n    - `clock_out_latitude` - GPS latitude when clocking out\n    - `clock_out_longitude` - GPS longitude when clocking out\n    - `clock_out_address` - Reverse geocoded address for clock out\n    - `clocked_in_from_home` - Boolean flag if clocked in from home address\n    - `clocked_out_from_home` - Boolean flag if clocked out from home address\n\n  2. Company Settings\n    - `require_gps_for_clock_in` - Require GPS location to clock in (default true)\n    - `require_gps_for_clock_out` - Require GPS location to clock out (default true)\n    - `home_clock_notification_enabled` - Send notification when clocking in/out from home (default true)\n    - `home_location_radius_meters` - Default radius to consider "at home" (default 100m)\n\n  3. Profile Columns\n    - `home_latitude` - Technician's home address latitude\n    - `home_longitude` - Technician's home address longitude\n    - `home_address` - Technician's home address text\n\n  4. Notifications\n    - New notification type: 'home_clock_alert'\n    - Sends notification to admins/managers when tech clocks in/out from home\n\n  5. Security\n    - Trigger automatically detects home location clocks\n    - Uses Haversine formula to calculate distance\n    - Configurable radius (default 100m)\n\n  6. Notes\n    - GPS is REQUIRED for clock in/out unless disabled by company setting\n    - Home location is determined by comparing clock in/out GPS to technician's home address\n    - Notification helps track potential policy violations\n*/\n\n-- Add GPS and home tracking columns to daily_clock_entries\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_latitude'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_latitude decimal(10,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_longitude'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_longitude decimal(11,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_address'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_address text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_latitude'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_latitude decimal(10,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_longitude'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_longitude decimal(11,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_address'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_address text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clocked_in_from_home'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clocked_in_from_home boolean DEFAULT false

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'daily_clock_entries' AND column_name = 'clocked_out_from_home'\n  ) THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN clocked_out_from_home boolean DEFAULT false

\n  END IF

\nEND $$

\n\n-- Add GPS requirement settings to company_settings\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'require_gps_for_clock_in'\n  ) THEN\n    ALTER TABLE company_settings ADD COLUMN require_gps_for_clock_in boolean DEFAULT true

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'require_gps_for_clock_out'\n  ) THEN\n    ALTER TABLE company_settings ADD COLUMN require_gps_for_clock_out boolean DEFAULT true

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'home_clock_notification_enabled'\n  ) THEN\n    ALTER TABLE company_settings ADD COLUMN home_clock_notification_enabled boolean DEFAULT true

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'company_settings' AND column_name = 'home_location_radius_meters'\n  ) THEN\n    ALTER TABLE company_settings ADD COLUMN home_location_radius_meters integer DEFAULT 100

\n  END IF

\nEND $$

\n\n-- Add home address to profiles (if not exists)\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'home_latitude'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN home_latitude decimal(10,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'home_longitude'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN home_longitude decimal(11,8)

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'home_address'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN home_address text

\n  END IF

\nEND $$

\n\n-- Add new notification type for home clock alerts (include all existing types)\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'notifications_type_check'\n  ) THEN\n    RAISE NOTICE 'Notifications type constraint does not exist yet'

\n  ELSE\n    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check

\n\n    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check\n      CHECK (type IN (\n        'lead_assignment',\n        'lead_status_change',\n        'task_assignment',\n        'task_due_soon',\n        'task_overdue',\n        'task_completed',\n        'task_comment',\n        'task_assigned',\n        'task',\n        'discussion_mention',\n        'discussion_reply',\n        'connection_milestone',\n        'reward_earned',\n        'work_order_assignment',\n        'work_order_status',\n        'parts_request',\n        'service_request',\n        'service_request_created',\n        'punchlist_service_request',\n        'late_clock_in',\n        'proposal_message',\n        'home_clock_alert'\n      ))

\n  END IF

\nEND $$

\n\n-- Create function to check if location is at home\nCREATE OR REPLACE FUNCTION is_at_home_location(\n  p_latitude decimal,\n  p_longitude decimal,\n  p_home_latitude decimal,\n  p_home_longitude decimal,\n  p_radius_meters integer DEFAULT 100\n)\nRETURNS boolean\nLANGUAGE plpgsql\nSTABLE\nAS $$\nDECLARE\n  v_distance_meters decimal

\nBEGIN\n  IF p_latitude IS NULL OR p_longitude IS NULL OR\n     p_home_latitude IS NULL OR p_home_longitude IS NULL THEN\n    RETURN false

\n  END IF

\n\n  v_distance_meters := 6371000 * 2 * ASIN(SQRT(\n    POWER(SIN(RADIANS(p_home_latitude - p_latitude) / 2), 2) +\n    COS(RADIANS(p_latitude)) * COS(RADIANS(p_home_latitude)) *\n    POWER(SIN(RADIANS(p_home_longitude - p_longitude) / 2), 2)\n  ))

\n\n  RETURN v_distance_meters <= p_radius_meters

\nEND

\n$$

\n\n-- Create trigger function to check home clock and send notifications\nCREATE OR REPLACE FUNCTION check_home_clock_and_notify()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_settings record

\n  v_profile record

\n  v_is_home_clock_in boolean := false

\n  v_is_home_clock_out boolean := false

\n  v_notification_message text

\n  v_admin_id uuid

\nBEGIN\n  SELECT\n    home_clock_notification_enabled,\n    home_location_radius_meters\n  INTO v_settings\n  FROM company_settings\n  LIMIT 1

\n\n  IF NOT COALESCE(v_settings.home_clock_notification_enabled, true) THEN\n    RETURN NEW

\n  END IF

\n\n  SELECT\n    full_name,\n    home_latitude,\n    home_longitude,\n    home_address\n  INTO v_profile\n  FROM profiles\n  WHERE id = NEW.technician_id

\n\n  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.clock_in IS DISTINCT FROM NEW.clock_in)) THEN\n    IF NEW.clock_in_latitude IS NOT NULL AND NEW.clock_in_longitude IS NOT NULL THEN\n      v_is_home_clock_in := is_at_home_location(\n        NEW.clock_in_latitude,\n        NEW.clock_in_longitude,\n        v_profile.home_latitude,\n        v_profile.home_longitude,\n        COALESCE(v_settings.home_location_radius_meters, 100)\n      )

\n\n      NEW.clocked_in_from_home := v_is_home_clock_in

\n\n      IF v_is_home_clock_in THEN\n        v_notification_message := v_profile.full_name || ' clocked in from home address at ' ||\n                                 TO_CHAR(NEW.clock_in, 'HH12:MI AM')

\n\n        FOR v_admin_id IN\n          SELECT id FROM profiles\n          WHERE role IN ('admin', 'office_manager', 'production_manager', 'service_manager')\n        LOOP\n          INSERT INTO notifications (\n            user_id,\n            type,\n            title,\n            message,\n            created_at\n          ) VALUES (\n            v_admin_id,\n            'home_clock_alert',\n            'Clock In from Home',\n            v_notification_message,\n            now()\n          )

\n        END LOOP

\n      END IF

\n    END IF

\n  END IF

\n\n  IF TG_OP = 'UPDATE' AND OLD.clock_out IS DISTINCT FROM NEW.clock_out THEN\n    IF NEW.clock_out_latitude IS NOT NULL AND NEW.clock_out_longitude IS NOT NULL THEN\n      v_is_home_clock_out := is_at_home_location(\n        NEW.clock_out_latitude,\n        NEW.clock_out_longitude,\n        v_profile.home_latitude,\n        v_profile.home_longitude,\n        COALESCE(v_settings.home_location_radius_meters, 100)\n      )

\n\n      NEW.clocked_out_from_home := v_is_home_clock_out

\n\n      IF v_is_home_clock_out THEN\n        v_notification_message := v_profile.full_name || ' clocked out from home address at ' ||\n                                 TO_CHAR(NEW.clock_out, 'HH12:MI AM')

\n\n        FOR v_admin_id IN\n          SELECT id FROM profiles\n          WHERE role IN ('admin', 'office_manager', 'production_manager', 'service_manager')\n        LOOP\n          INSERT INTO notifications (\n            user_id,\n            type,\n            title,\n            message,\n            created_at\n          ) VALUES (\n            v_admin_id,\n            'home_clock_alert',\n            'Clock Out from Home',\n            v_notification_message,\n            now()\n          )

\n        END LOOP

\n      END IF

\n    END IF

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Create trigger for home clock detection\nDROP TRIGGER IF EXISTS trigger_check_home_clock ON daily_clock_entries

\nCREATE TRIGGER trigger_check_home_clock\n  BEFORE INSERT OR UPDATE ON daily_clock_entries\n  FOR EACH ROW\n  EXECUTE FUNCTION check_home_clock_and_notify()

\n\n-- Create indexes for GPS coordinates\nCREATE INDEX IF NOT EXISTS idx_daily_clock_clock_in_location\n  ON daily_clock_entries(clock_in_latitude, clock_in_longitude)

\n\nCREATE INDEX IF NOT EXISTS idx_daily_clock_clock_out_location\n  ON daily_clock_entries(clock_out_latitude, clock_out_longitude)

\n\nCREATE INDEX IF NOT EXISTS idx_daily_clock_home_flags\n  ON daily_clock_entries(clocked_in_from_home, clocked_out_from_home)

\n\nCREATE INDEX IF NOT EXISTS idx_profiles_home_location\n  ON profiles(home_latitude, home_longitude)

\n
