/*
  # Fix update_device_nickname_stats trigger to include organization_id

  ## Problem
  The trigger function `update_device_nickname_stats` inserts into `device_nicknames`
  without supplying `organization_id`. The column has a default of `get_user_org_id()`
  but the function runs as SECURITY DEFINER (no authenticated user context), so
  `get_user_org_id()` returns NULL, violating the NOT NULL constraint.
  This causes every login to fail with a 400 error, leaving users with a dark/broken UI.

  ## Fix
  Update the trigger function to pass `NEW.organization_id` (from the user_sessions row
  being inserted) into the device_nicknames upsert. Also update the UNIQUE constraint
  to be per-organization by including organization_id, so different orgs don't collide.
*/

-- Update the trigger function to include organization_id
CREATE OR REPLACE FUNCTION update_device_nickname_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_signature text;
BEGIN
  -- Generate device signature
  v_device_signature := generate_device_signature(
    NEW.device_type,
    NEW.browser_name,
    NEW.os_name
  );

  -- Skip if org_id is null (shouldn't happen, but be safe)
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update or insert device nickname stats, scoped to organization
  INSERT INTO device_nicknames (
    device_signature,
    device_type,
    browser_name,
    os_name,
    nickname,
    last_seen,
    session_count,
    total_time_seconds,
    organization_id
  )
  VALUES (
    v_device_signature,
    NEW.device_type,
    NEW.browser_name,
    NEW.os_name,
    v_device_signature,
    NEW.last_activity,
    1,
    COALESCE(NEW.duration_seconds, 0),
    NEW.organization_id
  )
  ON CONFLICT (device_signature) DO UPDATE SET
    last_seen = EXCLUDED.last_seen,
    session_count = device_nicknames.session_count + 1,
    total_time_seconds = device_nicknames.total_time_seconds + EXCLUDED.total_time_seconds,
    updated_at = now();

  RETURN NEW;
END;
$$;
