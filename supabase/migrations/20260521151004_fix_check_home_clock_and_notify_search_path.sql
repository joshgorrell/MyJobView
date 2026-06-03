/*
  # Fix mutable search_path on check_home_clock_and_notify

  ## Problem
  The function has a mutable search_path which allows a malicious user to
  hijack function resolution by placing objects in their own schema.

  ## Fix
  Recreate the function with SET search_path = public, pg_temp to lock it down.
*/

CREATE OR REPLACE FUNCTION public.check_home_clock_and_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
v_settings record;
v_profile record;
v_org_id uuid;
v_distance_in integer;
v_distance_out integer;
v_is_home_clock_in boolean := false;
v_is_home_clock_out boolean := false;
v_recipient record;
BEGIN
-- Get technician profile with home coordinates and org id
SELECT 
id,
full_name,
home_latitude,
home_longitude,
home_address,
organization_id
INTO v_profile
FROM profiles
WHERE id = NEW.technician_id;

v_org_id := v_profile.organization_id;

-- Get company settings for this org
SELECT 
home_clock_notification_enabled,
home_location_radius_meters,
home_clock_notification_roles
INTO v_settings
FROM company_settings
WHERE organization_id = v_org_id
LIMIT 1;

-- If no org-specific settings, fall back to any row
IF v_settings IS NULL THEN
SELECT 
home_clock_notification_enabled,
home_location_radius_meters,
home_clock_notification_roles
INTO v_settings
FROM company_settings
LIMIT 1;
END IF;

-- Exit early if notifications are disabled
IF NOT COALESCE(v_settings.home_clock_notification_enabled, false) THEN
RETURN NEW;
END IF;

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

IF v_distance_in IS NOT NULL AND v_distance_in <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
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

IF v_distance_out IS NOT NULL AND v_distance_out <= COALESCE(v_settings.home_location_radius_meters, 150) THEN
v_is_home_clock_out := true;
NEW.clocked_out_from_home := true;
END IF;
END IF;

-- Send notifications for clock-in from home
IF v_is_home_clock_in THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock In From Home',
v_profile.full_name || ' clocked in from home at ' ||
TO_CHAR(NEW.clock_in AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||
CASE
WHEN v_distance_in IS NOT NULL THEN ' (' || v_distance_in || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

-- Send notifications for clock-out from home
IF v_is_home_clock_out THEN
FOR v_recipient IN
SELECT id
FROM profiles
WHERE organization_id = v_org_id
AND role = ANY(COALESCE(
v_settings.home_clock_notification_roles,
ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']
))
LOOP
INSERT INTO notifications (
user_id,
type,
title,
body,
related_id,
organization_id
) VALUES (
v_recipient.id,
'home_clock',
'Clock Out From Home',
v_profile.full_name || ' clocked out from home at ' ||
TO_CHAR(NEW.clock_out AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||
CASE
WHEN v_distance_out IS NOT NULL THEN ' (' || v_distance_out || 'm from home)'
ELSE ''
END,
NEW.id,
v_org_id
);
END LOOP;
END IF;

RETURN NEW;
END;
$$;
