/*
  # Fix Travel Bonus Job Address Population

  1. Problem
    - Travel bonus requests showing empty job_address field
    - Trigger was using work_orders.address which isn't always populated
    - Need to get address from contact via project relationship

  2. Solution
    - Update trigger to fetch address from contact through project
    - Build full address from contact's address fields
    - Fallback to work_order.address if it exists
*/

-- Drop and recreate the travel bonus trigger function with proper address fetching
CREATE OR REPLACE FUNCTION create_travel_bonus_request()
RETURNS TRIGGER AS $$
DECLARE
  v_tech_record RECORD;
  v_office_settings RECORD;
  v_office_location RECORD;
  v_work_order RECORD;
  v_project RECORD;
  v_contact RECORD;
  v_distance_miles decimal;
  v_eligible_miles decimal;
  v_bonus_amount decimal;
  v_rate decimal;
  v_method text;
  v_daily_clock_id uuid;
  v_job_address text;
BEGIN
  -- Only process when time entry is completed (has clock_out)
  IF NEW.clock_out IS NULL OR OLD.clock_out IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get tech record with travel bonus settings
  SELECT * INTO v_tech_record
  FROM profiles
  WHERE id = NEW.technician_id
  AND travel_bonus_enabled = true;

  -- If tech doesn't have travel bonus enabled, skip
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get work order details
  SELECT * INTO v_work_order
  FROM work_orders
  WHERE id = NEW.work_order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Try to get project and contact for address
  IF v_work_order.project_id IS NOT NULL THEN
    SELECT * INTO v_project
    FROM projects
    WHERE id = v_work_order.project_id;

    IF FOUND AND v_project.contact_id IS NOT NULL THEN
      SELECT * INTO v_contact
      FROM contacts
      WHERE id = v_project.contact_id;

      IF FOUND THEN
        -- Build address from contact fields
        v_job_address := CONCAT_WS(', ',
          NULLIF(v_contact.address, ''),
          NULLIF(v_contact.city, ''),
          CASE WHEN v_contact.state IS NOT NULL AND v_contact.zip_code IS NOT NULL
            THEN CONCAT(v_contact.state, ' ', v_contact.zip_code)
            WHEN v_contact.state IS NOT NULL THEN v_contact.state
            WHEN v_contact.zip_code IS NOT NULL THEN v_contact.zip_code
            ELSE NULL
          END
        );
      END IF;
    END IF;
  END IF;

  -- Fallback to work order address if we didn't get one from contact
  IF v_job_address IS NULL OR v_job_address = '' THEN
    v_job_address := COALESCE(v_work_order.address, 'Unknown Location');
  END IF;

  -- Get office location
  SELECT
    co.id,
    COALESCE(co.latitude, 0) as latitude,
    COALESCE(co.longitude, 0) as longitude
  INTO v_office_location
  FROM company_offices co
  WHERE co.id = COALESCE(v_tech_record.primary_office_id, v_work_order.office_id);

  IF NOT FOUND OR v_office_location.latitude = 0 OR v_office_location.longitude = 0 THEN
    RETURN NEW;
  END IF;

  -- Get office travel settings
  SELECT * INTO v_office_settings
  FROM office_travel_settings
  WHERE office_id = v_office_location.id;

  -- If no settings exist, create defaults
  IF NOT FOUND THEN
    INSERT INTO office_travel_settings (office_id)
    VALUES (v_office_location.id)
    RETURNING * INTO v_office_settings;
  END IF;

  -- Use tech's rate if set, otherwise use office default
  v_rate := COALESCE(v_tech_record.travel_bonus_rate, v_office_settings.default_rate_per_mile, 0.50);
  v_method := COALESCE(v_tech_record.travel_bonus_method, v_office_settings.calculation_method, 'round_trip');

  -- Get coordinates from project contact if available
  IF v_contact.latitude IS NOT NULL AND v_contact.longitude IS NOT NULL THEN
    v_work_order.latitude := v_contact.latitude;
    v_work_order.longitude := v_contact.longitude;
  END IF;

  -- Calculate distance from office to job site
  v_distance_miles := calculate_distance_miles(
    v_office_location.latitude,
    v_office_location.longitude,
    COALESCE(v_work_order.latitude, 0),
    COALESCE(v_work_order.longitude, 0)
  );

  -- Skip if we don't have job coordinates
  IF v_distance_miles = 0 THEN
    RETURN NEW;
  END IF;

  -- If round trip, double the distance
  IF v_method = 'round_trip' THEN
    v_distance_miles := v_distance_miles * 2;
  END IF;

  -- Calculate eligible miles (only miles outside radius bubble)
  IF v_method = 'round_trip' THEN
    -- For round trip, subtract radius from each direction
    v_eligible_miles := GREATEST(0, v_distance_miles - (v_office_settings.radius_miles * 2));
  ELSE
    -- For one way, subtract radius once
    v_eligible_miles := GREATEST(0, v_distance_miles - v_office_settings.radius_miles);
  END IF;

  -- Calculate bonus amount
  v_bonus_amount := v_eligible_miles * v_rate;

  -- Only create request if there are eligible miles
  IF v_eligible_miles > 0 AND v_bonus_amount > 0 THEN
    -- Get today's daily clock entry for the tech
    SELECT id INTO v_daily_clock_id
    FROM time_clock_history
    WHERE technician_id = NEW.technician_id
    AND entry_date = CURRENT_DATE
    LIMIT 1;

    -- Create travel bonus request
    INSERT INTO travel_bonus_requests (
      technician_id,
      work_order_id,
      daily_clock_entry_id,
      office_id,
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
      v_job_address,
      v_work_order.latitude,
      v_work_order.longitude,
      v_office_location.latitude,
      v_office_location.longitude,
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
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;