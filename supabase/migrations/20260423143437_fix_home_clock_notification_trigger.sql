/*\n  # Fix Home Clock Notification Trigger\n\n  ## Problem\n  The `check_home_clock_and_notify()` trigger function has three bugs that cause\n  all home clock notifications to fail silently:\n\n  1. **Wrong column names**: Inserts into `reference_id` and `reference_type` which\n     do not exist on the notifications table. The correct column is `related_id` (uuid).\n\n  2. **Missing organization_id**: The notifications table has a NOT NULL `organization_id`\n     column, but the trigger never provides it, causing the INSERT to fail.\n\n  3. **Wrong notification type**: Creates notifications with type `'clock_event'` but\n     the NotificationBell component (and the allowed type constraint) uses `'home_clock'`.\n\n  ## Fix\n  Replace the trigger function to:\n  - Use `related_id` (uuid cast of the entry id) instead of `reference_id`/`reference_type`\n  - Look up and include `organization_id` from the technician's profile\n  - Use type `'home_clock'` to match the UI handler and constraint\n  - Also use `company_settings` joined to the org (via organizations table) rather than\n    bare LIMIT 1, for correctness in multi-org setup\n*/\n\nCREATE OR REPLACE FUNCTION check_home_clock_and_notify()\nRETURNS TRIGGER AS $$\nDECLARE\n  v_settings record

\n  v_profile record

\n  v_org_id uuid

\n  v_distance_in integer

\n  v_distance_out integer

\n  v_is_home_clock_in boolean := false

\n  v_is_home_clock_out boolean := false

\n  v_recipient record

\nBEGIN\n  -- Get technician profile with home coordinates and org id\n  SELECT \n    id,\n    full_name,\n    home_latitude,\n    home_longitude,\n    home_address,\n    organization_id\n  INTO v_profile\n  FROM profiles\n  WHERE id = NEW.technician_id

\n\n  v_org_id := v_profile.organization_id

\n\n  -- Get company settings for this org\n  SELECT \n    home_clock_notification_enabled,\n    home_location_radius_meters,\n    home_clock_notification_roles\n  INTO v_settings\n  FROM company_settings\n  WHERE organization_id = v_org_id\n  LIMIT 1

\n\n  -- If no org-specific settings, fall back to any row\n  IF v_settings IS NULL THEN\n    SELECT \n      home_clock_notification_enabled,\n      home_location_radius_meters,\n      home_clock_notification_roles\n    INTO v_settings\n    FROM company_settings\n    LIMIT 1

\n  END IF

\n\n  -- Exit early if notifications are disabled\n  IF NOT COALESCE(v_settings.home_clock_notification_enabled, false) THEN\n    RETURN NEW

\n  END IF

\n\n  -- Check clock IN from home (only on INSERT or when clock_in changes)\n  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.clock_in IS DISTINCT FROM NEW.clock_in))\n     AND NEW.clock_in IS NOT NULL\n     AND NEW.clock_in_latitude IS NOT NULL\n     AND NEW.clock_in_longitude IS NOT NULL\n     AND v_profile.home_latitude IS NOT NULL\n     AND v_profile.home_longitude IS NOT NULL THEN\n\n    v_distance_in := calculate_distance_meters(\n      NEW.clock_in_latitude,\n      NEW.clock_in_longitude,\n      v_profile.home_latitude,\n      v_profile.home_longitude\n    )

\n\n    IF v_distance_in IS NOT NULL AND v_distance_in <= COALESCE(v_settings.home_location_radius_meters, 150) THEN\n      v_is_home_clock_in := true

\n      NEW.clocked_in_from_home := true

\n    END IF

\n  END IF

\n\n  -- Check clock OUT from home (only when clock_out changes)\n  IF TG_OP = 'UPDATE'\n     AND OLD.clock_out IS DISTINCT FROM NEW.clock_out\n     AND NEW.clock_out IS NOT NULL\n     AND NEW.clock_out_latitude IS NOT NULL\n     AND NEW.clock_out_longitude IS NOT NULL\n     AND v_profile.home_latitude IS NOT NULL\n     AND v_profile.home_longitude IS NOT NULL THEN\n\n    v_distance_out := calculate_distance_meters(\n      NEW.clock_out_latitude,\n      NEW.clock_out_longitude,\n      v_profile.home_latitude,\n      v_profile.home_longitude\n    )

\n\n    IF v_distance_out IS NOT NULL AND v_distance_out <= COALESCE(v_settings.home_location_radius_meters, 150) THEN\n      v_is_home_clock_out := true

\n      NEW.clocked_out_from_home := true

\n    END IF

\n  END IF

\n\n  -- Send notifications for clock-in from home\n  IF v_is_home_clock_in THEN\n    FOR v_recipient IN\n      SELECT id\n      FROM profiles\n      WHERE organization_id = v_org_id\n        AND role = ANY(COALESCE(\n          v_settings.home_clock_notification_roles,\n          ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']\n        ))\n    LOOP\n      INSERT INTO notifications (\n        user_id,\n        type,\n        title,\n        body,\n        related_id,\n        organization_id\n      ) VALUES (\n        v_recipient.id,\n        'home_clock',\n        'Clock In From Home',\n        v_profile.full_name || ' clocked in from home at ' ||\n          TO_CHAR(NEW.clock_in AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||\n          CASE\n            WHEN v_distance_in IS NOT NULL THEN ' (' || v_distance_in || 'm from home)'\n            ELSE ''\n          END,\n        NEW.id,\n        v_org_id\n      )

\n    END LOOP

\n  END IF

\n\n  -- Send notifications for clock-out from home\n  IF v_is_home_clock_out THEN\n    FOR v_recipient IN\n      SELECT id\n      FROM profiles\n      WHERE organization_id = v_org_id\n        AND role = ANY(COALESCE(\n          v_settings.home_clock_notification_roles,\n          ARRAY['admin', 'office_manager', 'production_manager', 'service_manager']\n        ))\n    LOOP\n      INSERT INTO notifications (\n        user_id,\n        type,\n        title,\n        body,\n        related_id,\n        organization_id\n      ) VALUES (\n        v_recipient.id,\n        'home_clock',\n        'Clock Out From Home',\n        v_profile.full_name || ' clocked out from home at ' ||\n          TO_CHAR(NEW.clock_out AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ||\n          CASE\n            WHEN v_distance_out IS NOT NULL THEN ' (' || v_distance_out || 'm from home)'\n            ELSE ''\n          END,\n        NEW.id,\n        v_org_id\n      )

\n    END LOOP

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n
