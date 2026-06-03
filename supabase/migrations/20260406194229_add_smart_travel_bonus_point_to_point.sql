/*
  # Smart Travel Bonus: Point-to-Point Distance Calculation

  ## Summary
  Upgrades the travel bonus system to calculate trips based on actual travel origin
  rather than always assuming the tech starts from the home office. This prevents
  paying double office-to-job distance when a tech drives directly from one job
  to the next.

  ## Changes

  ### 1. office_travel_settings
  - Added `same_day_job_window_hours` (numeric, default 4): How many hours back to
    look for a prior same-day job clock-out when determining the travel origin.
    If the tech clocked out of a prior job within this window, that job's coordinates
    become the trip origin instead of the home office.

  ### 2. travel_bonus_requests
  - Added `from_type` (text): Either `'office'` or `'previous_job'`. Indicates
    what location was used as the trip origin for distance calculation.
  - Added `from_address` (text): Human-readable address of the origin point.
  - Added `from_latitude` (decimal): Latitude of the trip origin.
  - Added `from_longitude` (decimal): Longitude of the trip origin.
  - Added unique constraint on (technician_id, work_order_id) to prevent duplicate
    bonus records from multiple clock-in events on the same work order.

  ### 3. create_travel_bonus_request() function (REWRITE)
  - Trigger now fires on clock-IN to a work order (INSERT on time_entries),
    not clock-out, because we need to know where the tech is coming FROM.
  - On clock-in, looks up the most recent same-day time_entry for this tech
    where clock_out IS NOT NULL and clock_out is within same_day_job_window_hours.
  - If found → uses that prior job's work order GPS as the `from` origin
    (from_type = 'previous_job'). No radius bubble deduction applied in this case.
  - If not found → uses the tech's home office GPS as the `from` origin
    (from_type = 'office'). Radius bubble deduction still applies normally.
  - When origin is a prior job, calculation is always one-way (job A → job B)
    since we cannot know the return path until the day ends.
  - When origin is office with round_trip method, distance × 2 still applied.

  ## Security
  - No changes to RLS policies (existing policies remain valid)
  - Unique constraint prevents duplicate bonuses

  ## Notes
  - The unique constraint uses ON CONFLICT DO NOTHING so re-triggers are safe.
  - `office_latitude`/`office_longitude` columns are kept for backward compatibility
    but now store the origin coordinates (whether office or prior job).
*/

-- 1. Add same_day_job_window_hours to office_travel_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'office_travel_settings'
    AND column_name = 'same_day_job_window_hours'
  ) THEN
    ALTER TABLE office_travel_settings
      ADD COLUMN same_day_job_window_hours numeric(4,1) DEFAULT 4.0 NOT NULL;
  END IF;
END $$;

-- 2. Add from_type, from_address, from_latitude, from_longitude to travel_bonus_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'travel_bonus_requests' AND column_name = 'from_type'
  ) THEN
    ALTER TABLE travel_bonus_requests
      ADD COLUMN from_type text DEFAULT 'office' CHECK (from_type IN ('office', 'previous_job'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'travel_bonus_requests' AND column_name = 'from_address'
  ) THEN
    ALTER TABLE travel_bonus_requests
      ADD COLUMN from_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'travel_bonus_requests' AND column_name = 'from_latitude'
  ) THEN
    ALTER TABLE travel_bonus_requests
      ADD COLUMN from_latitude decimal(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'travel_bonus_requests' AND column_name = 'from_longitude'
  ) THEN
    ALTER TABLE travel_bonus_requests
      ADD COLUMN from_longitude decimal(11, 8);
  END IF;
END $$;

-- 3. Add unique constraint to prevent duplicate bonus records per tech + work order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'travel_bonus_requests'
    AND constraint_name = 'uq_travel_bonus_tech_work_order'
  ) THEN
    ALTER TABLE travel_bonus_requests
      ADD CONSTRAINT uq_travel_bonus_tech_work_order
      UNIQUE (technician_id, work_order_id);
  END IF;
END $$;

-- 4. Rewrite the travel bonus trigger function
--    Trigger: fires on INSERT into time_entries (clock-in to a work order)
CREATE OR REPLACE FUNCTION create_travel_bonus_request()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Drop the old trigger (was on UPDATE) and create new one on INSERT
DROP TRIGGER IF EXISTS trigger_create_travel_bonus ON time_entries;

CREATE TRIGGER trigger_create_travel_bonus
  AFTER INSERT ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_travel_bonus_request();

-- 6. Add index on from_type for queue filtering
CREATE INDEX IF NOT EXISTS idx_travel_bonus_from_type
  ON travel_bonus_requests(from_type);
