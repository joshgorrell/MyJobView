-- Read-only production travel function snapshot, 2026-10-02. Local tests only.

CREATE OR REPLACE FUNCTION public.calculate_distance_miles(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
earth_radius decimal := 3958.8; -- Earth's radius in miles
dlat decimal;
dlon decimal;
a decimal;
c decimal;
BEGIN
dlat := radians(lat2 - lat1);
dlon := radians(lon2 - lon1);

a := sin(dlat/2) * sin(dlat/2) +
cos(radians(lat1)) * cos(radians(lat2)) *
sin(dlon/2) * sin(dlon/2);

c := 2 * atan2(sqrt(a), sqrt(1-a));

RETURN earth_radius * c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_travel_bonus_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_tech_record          RECORD;
v_office_settings      RECORD;
v_office_location      RECORD;
v_work_order           RECORD;
v_prior_job            RECORD;
v_from_lat             decimal;
v_from_lon             decimal;
v_from_address         text;
v_from_type            text;
v_distance_miles       decimal;
v_eligible_miles       decimal;
v_bonus_amount         decimal;
v_rate                 decimal;
v_method               text;
v_daily_clock_id       uuid;
v_window_hours         numeric;
BEGIN
-- Only process when a work order time entry is created (clock-in)
-- NEW.clock_out will be NULL on insert (just clocked in)
-- Must have a work_order_id to calculate travel
IF NEW.work_order_id IS NULL THEN
RETURN NEW;
END IF;

-- Only fire on INSERT (fresh clock-in)
-- Skip if this is somehow an update
IF TG_OP != 'INSERT' THEN
RETURN NEW;
END IF;

-- Get tech record with travel bonus settings
SELECT * INTO v_tech_record
FROM profiles
WHERE id = NEW.technician_id
AND travel_bonus_enabled = true;

IF NOT FOUND THEN
RETURN NEW;
END IF;

-- Get work order details (need GPS coordinates of the destination)
SELECT * INTO v_work_order
FROM work_orders
WHERE id = NEW.work_order_id;

IF NOT FOUND THEN
RETURN NEW;
END IF;

-- Skip if work order has no GPS coordinates (can't calculate distance)
IF v_work_order.latitude IS NULL OR v_work_order.longitude IS NULL
OR v_work_order.latitude = 0 OR v_work_order.longitude = 0 THEN
RETURN NEW;
END IF;

-- Get the tech's home office location
SELECT
co.id,
COALESCE(co.latitude, 0)  AS latitude,
COALESCE(co.longitude, 0) AS longitude,
co.office_name,
co.city,
co.state
INTO v_office_location
FROM company_offices co
WHERE co.id = COALESCE(v_tech_record.primary_office_id, v_work_order.office_id);

IF NOT FOUND OR v_office_location.latitude = 0 OR v_office_location.longitude = 0 THEN
RETURN NEW;
END IF;

-- Get (or create) office travel settings
SELECT * INTO v_office_settings
FROM office_travel_settings
WHERE office_id = v_office_location.id;

IF NOT FOUND THEN
INSERT INTO office_travel_settings (office_id)
VALUES (v_office_location.id)
RETURNING * INTO v_office_settings;
END IF;

v_rate         := COALESCE(v_tech_record.travel_bonus_rate, v_office_settings.default_rate_per_mile, 0.50);
v_method       := COALESCE(v_tech_record.travel_bonus_method, v_office_settings.calculation_method, 'round_trip');
v_window_hours := COALESCE(v_office_settings.same_day_job_window_hours, 4.0);

-- ----------------------------------------------------------------
-- Determine trip origin: previous job vs. home office
-- Look for the most recent clock-out on a DIFFERENT work order
-- for this tech on the same calendar day, within the window.
-- ----------------------------------------------------------------
SELECT
te.id,
wo.latitude   AS lat,
wo.longitude  AS lon,
wo.address    AS addr
INTO v_prior_job
FROM time_entries te
JOIN work_orders wo ON wo.id = te.work_order_id
WHERE te.technician_id  = NEW.technician_id
AND te.work_order_id != NEW.work_order_id
AND te.clock_out IS NOT NULL
-- same calendar day as the new clock-in
AND DATE(te.clock_out AT TIME ZONE 'UTC') = DATE(NEW.clock_in AT TIME ZONE 'UTC')
-- clock-out must be within the window before this clock-in
AND te.clock_out >= (NEW.clock_in - (v_window_hours || ' hours')::interval)
AND te.clock_out <= NEW.clock_in
-- prior job must also have GPS coordinates
AND wo.latitude  IS NOT NULL
AND wo.longitude IS NOT NULL
AND wo.latitude  != 0
AND wo.longitude != 0
ORDER BY te.clock_out DESC
LIMIT 1;

IF FOUND AND v_prior_job.lat IS NOT NULL AND v_prior_job.lon IS NOT NULL THEN
-- Tech is coming from a prior job site — point-to-point, no radius deduction
v_from_lat     := v_prior_job.lat;
v_from_lon     := v_prior_job.lon;
v_from_address := COALESCE(v_prior_job.addr, 'Previous Job Site');
v_from_type    := 'previous_job';
-- Job-to-job is always one-way (we don't know the return yet)
v_method       := 'one_way';
ELSE
-- Tech is coming from the home office
v_from_lat     := v_office_location.latitude;
v_from_lon     := v_office_location.longitude;
v_from_address := TRIM(
COALESCE(v_office_location.office_name, '') || ' - ' ||
COALESCE(v_office_location.city, '') || ', ' ||
COALESCE(v_office_location.state, '')
);
v_from_type    := 'office';
END IF;

-- ----------------------------------------------------------------
-- Calculate distance from origin to job site
-- ----------------------------------------------------------------
v_distance_miles := calculate_distance_miles(
v_from_lat,
v_from_lon,
v_work_order.latitude,
v_work_order.longitude
);

IF v_distance_miles = 0 THEN
RETURN NEW;
END IF;

-- Apply round-trip multiplier only when departing from office
IF v_from_type = 'office' AND v_method = 'round_trip' THEN
v_distance_miles := v_distance_miles * 2;
END IF;

-- Calculate eligible miles
-- Radius bubble only applies when departing from office
IF v_from_type = 'office' THEN
IF v_method = 'round_trip' THEN
v_eligible_miles := GREATEST(0, v_distance_miles - (v_office_settings.radius_miles * 2));
ELSE
v_eligible_miles := GREATEST(0, v_distance_miles - v_office_settings.radius_miles);
END IF;
ELSE
-- Job-to-job: full distance is eligible (no radius deduction)
v_eligible_miles := v_distance_miles;
END IF;

v_bonus_amount := v_eligible_miles * v_rate;

IF v_eligible_miles <= 0 OR v_bonus_amount <= 0 THEN
RETURN NEW;
END IF;

-- Get today's daily clock entry
SELECT id INTO v_daily_clock_id
FROM daily_clock_entries
WHERE technician_id = NEW.technician_id
AND entry_date = DATE(NEW.clock_in AT TIME ZONE 'UTC')
LIMIT 1;

-- Insert the bonus request; skip silently if duplicate (same tech + work order)
INSERT INTO travel_bonus_requests (
technician_id,
work_order_id,
daily_clock_entry_id,
office_id,
from_type,
from_address,
from_latitude,
from_longitude,
job_address,
job_latitude,
job_longitude,
office_latitude,
office_longitude,
total_distance_miles,
eligible_miles,
rate_per_mile,
bonus_amount,
calculation_method,
status
) VALUES (
NEW.technician_id,
NEW.work_order_id,
v_daily_clock_id,
v_office_location.id,
v_from_type,
v_from_address,
v_from_lat,
v_from_lon,
COALESCE(v_work_order.address, 'Unknown'),
v_work_order.latitude,
v_work_order.longitude,
v_from_lat,           -- keep office_lat/lon pointing at the actual origin
v_from_lon,
v_distance_miles,
v_eligible_miles,
v_rate,
v_bonus_amount,
v_method,
CASE
WHEN v_office_settings.auto_approve_under_amount IS NOT NULL
AND v_bonus_amount <= v_office_settings.auto_approve_under_amount
THEN 'approved'
ELSE 'pending'
END
)
ON CONFLICT (technician_id, work_order_id) DO NOTHING;

RETURN NEW;
END;
$function$;
CREATE TRIGGER trigger_create_travel_bonus AFTER INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION create_travel_bonus_request();

