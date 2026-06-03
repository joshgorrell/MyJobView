/*
  # Add Home Clock Notification with Role Selection

  1. New Settings
    - Add `home_clock_notification_enabled` to company_settings - Enable/disable home clock notifications
    - Add `home_location_radius_meters` to company_settings - Distance threshold for "at home" (default 100m)
    - Add `home_clock_notification_roles` to company_settings - Array of roles that should receive notifications
    - Add `require_gps_for_clock_in` to company_settings - Require GPS on clock in
    - Add `require_gps_for_clock_out` to company_settings - Require GPS on clock out

  2. Daily Clock GPS Fields
    - Add GPS coordinates and address to daily_clock_entries for clock in and clock out

  3. Notification Trigger
    - Create trigger to detect when someone clocks in/out from home
    - Send notifications to selected roles only
    - Uses existing calculate_distance_meters function

  4. Security
    - Only admins can modify these settings
    - All authenticated users can view (for transparency)
*/

-- Add home address GPS fields to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'home_latitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN home_latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'home_longitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN home_longitude decimal(11, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'home_address'
  ) THEN
    ALTER TABLE profiles ADD COLUMN home_address text;
  END IF;
END $$;

-- Add GPS fields to daily_clock_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_latitude'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_longitude'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_longitude decimal(11, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_in_address'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_in_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_latitude'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_longitude'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_longitude decimal(11, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clock_out_address'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clock_out_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clocked_in_from_home'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clocked_in_from_home boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'clocked_out_from_home'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN clocked_out_from_home boolean DEFAULT false;
  END IF;
END $$;

-- Add home clock notification settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'home_clock_notification_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN home_clock_notification_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'home_location_radius_meters'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN home_location_radius_meters integer DEFAULT 100;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'home_clock_notification_roles'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN home_clock_notification_roles text[] DEFAULT ARRAY['admin', 'office_manager', 'production_manager', 'service_manager'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'require_gps_for_clock_in'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN require_gps_for_clock_in boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'require_gps_for_clock_out'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN require_gps_for_clock_out boolean DEFAULT true;
  END IF;
END $$;

-- Trigger function to detect home clock events and notify selected roles
CREATE OR REPLACE FUNCTION check_home_clock_and_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_settings record;
  v_profile record;
  v_distance_in integer;
  v_distance_out integer;
  v_is_home_clock_in boolean := false;
  v_is_home_clock_out boolean := false;
  v_recipient record;
BEGIN
  -- Get company settings
  SELECT 
    home_clock_notification_enabled,
    home_location_radius_meters,
    home_clock_notification_roles
  INTO v_settings
  FROM company_settings
  LIMIT 1;

  -- Exit early if notifications are disabled
  IF NOT COALESCE(v_settings.home_clock_notification_enabled, true) THEN
    RETURN NEW;
  END IF;

  -- Get technician profile with home coordinates
  SELECT 
    id,
    full_name,
    home_latitude,
    home_longitude,
    home_address
  INTO v_profile
  FROM profiles
  WHERE id = NEW.technician_id;

  -- Check clock IN from home (only on INSERT or when clock_in changes)
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.clock_in IS DISTINCT FROM NEW.clock_in)) 
     AND NEW.clock_in IS NOT NULL 
     AND NEW.clock_in_latitude IS NOT NULL 
     AND NEW.clock_in_longitude IS NOT NULL
     AND v_profile.home_latitude IS NOT NULL 
     AND v_profile.home_longitude IS NOT NULL THEN
    
    v_distance_in := calculate_distance_meters(
      NEW.clock_in_latitude,
      NEW.clock_in_longitude,
      v_profile.home_latitude,
      v_profile.home_longitude
    );

    IF v_distance_in IS NOT NULL AND v_distance_in <= COALESCE(v_settings.home_location_radius_meters, 100) THEN
      v_is_home_clock_in := true;
      NEW.clocked_in_from_home := true;
    END IF;
  END IF;

  -- Check clock OUT from home (only when clock_out changes)
  IF TG_OP = 'UPDATE' 
     AND OLD.clock_out IS DISTINCT FROM NEW.clock_out 
     AND NEW.clock_out IS NOT NULL 
     AND NEW.clock_out_latitude IS NOT NULL 
     AND NEW.clock_out_longitude IS NOT NULL
     AND v_profile.home_latitude IS NOT NULL 
     AND v_profile.home_longitude IS NOT NULL THEN
    
    v_distance_out := calculate_distance_meters(
      NEW.clock_out_latitude,
      NEW.clock_out_longitude,
      v_profile.home_latitude,
      v_profile.home_longitude
    );

    IF v_distance_out IS NOT NULL AND v_distance_out <= COALESCE(v_settings.home_location_radius_meters, 100) THEN
      v_is_home_clock_out := true;
      NEW.clocked_out_from_home := true;
    END IF;
  END IF;

  -- Send notifications to selected roles
  IF v_is_home_clock_in THEN
    FOR v_recipient IN
      SELECT id
      FROM profiles
      WHERE role = ANY(COALESCE(v_settings.home_clock_notification_roles, ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']))
    LOOP
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        reference_id,
        reference_type
      ) VALUES (
        v_recipient.id,
        'clock_event',
        'Clock In From Home',
        v_profile.full_name || ' clocked in from home address at ' || 
          TO_CHAR(NEW.clock_in, 'HH12:MI AM') || 
          CASE 
            WHEN v_distance_in IS NOT NULL THEN ' (within ' || v_distance_in || 'm of home)'
            ELSE ''
          END,
        NEW.id::text,
        'daily_clock_entry'
      );
    END LOOP;
  END IF;

  IF v_is_home_clock_out THEN
    FOR v_recipient IN
      SELECT id
      FROM profiles
      WHERE role = ANY(COALESCE(v_settings.home_clock_notification_roles, ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']))
    LOOP
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        reference_id,
        reference_type
      ) VALUES (
        v_recipient.id,
        'clock_event',
        'Clock Out From Home',
        v_profile.full_name || ' clocked out from home address at ' || 
          TO_CHAR(NEW.clock_out, 'HH12:MI AM') || 
          CASE 
            WHEN v_distance_out IS NOT NULL THEN ' (within ' || v_distance_out || 'm of home)'
            ELSE ''
          END,
        NEW.id::text,
        'daily_clock_entry'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on daily_clock_entries
DROP TRIGGER IF EXISTS check_home_clock_trigger ON daily_clock_entries;
CREATE TRIGGER check_home_clock_trigger
  BEFORE INSERT OR UPDATE ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_home_clock_and_notify();

-- Update notifications type constraint to include all types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_type_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
      'lead_assignment', 'task_assignment', 'task_comment', 'task_completed',
      'discussion_reply', 'discussion_mention', 'system', 'lead_status_change',
      'task_notification', 'work_order_assignment', 'proposal_message', 
      'proposal_reactivation', 'clock_event', 'task', 'punchlist_service_request',
      'service_request_created'
    ));
END $$;

COMMENT ON FUNCTION check_home_clock_and_notify() IS
'Trigger function that detects when technicians clock in/out from their home address.
Checks distance between clock location and home address from profile.
Sends notifications to roles specified in company_settings.home_clock_notification_roles.';
