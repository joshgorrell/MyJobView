/*
  # Fix handle_new_user trigger to skip portal users

  The trigger was creating a profiles row for portal users (contacts accessing the
  customer portal), which caused a role constraint violation since 'portal_user' is
  not a valid staff role. Portal users only need an auth.users entry — no profile row.

  Also cleans up the stale profile row created for John Candy's portal auth user.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_role text;
  v_full_name text;
  v_email text;
  v_org_id uuid;
  v_employment_type text;
  v_requires_daily_clock boolean;
BEGIN
  -- Skip profile creation for portal users (customers accessing the customer portal)
  IF (NEW.raw_user_meta_data->>'is_portal_user')::boolean = true THEN
    RETURN NEW;
  END IF;

  v_email := NEW.email;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1));
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(regexp_replace(split_part(v_email, '@', 1), '[^a-zA-Z0-9]', '', 'g'))
  );
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'sales');
  v_org_id := (NEW.raw_user_meta_data->>'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organizations LIMIT 1;
  END IF;

  IF v_role = 'tech' THEN
    v_employment_type := 'hourly';
    v_requires_daily_clock := true;
  ELSIF v_role IN ('admin', 'finance', 'manager') THEN
    v_employment_type := 'salary_no_clock';
    v_requires_daily_clock := false;
  ELSE
    v_employment_type := 'salary';
    v_requires_daily_clock := false;
  END IF;

  BEGIN
    INSERT INTO profiles (id, email, full_name, username, role, organization_id, employment_type, requires_daily_clock)
    VALUES (NEW.id, v_email, v_full_name, v_username, v_role, v_org_id, v_employment_type, v_requires_daily_clock);
  EXCEPTION WHEN unique_violation THEN
    v_username := v_username || '_' || substr(NEW.id::text, 1, 4);
    INSERT INTO profiles (id, email, full_name, username, role, organization_id, employment_type, requires_daily_clock)
    VALUES (NEW.id, v_email, v_full_name, v_username, v_role, v_org_id, v_employment_type, v_requires_daily_clock);
  END;

  BEGIN
    INSERT INTO user_starred_modules (user_id, module_id, sort_order)
    SELECT NEW.id, dsm.module_id, dsm.sort_order
    FROM default_starred_modules dsm
    WHERE dsm.role = v_role
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to populate default starred modules for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Remove the stale profile row that was created for the portal auth user
DELETE FROM profiles
WHERE id = '9db8034f-de44-40bd-ab57-ebe58f3302da'
  AND id IN (
    SELECT portal_user_id FROM contacts WHERE portal_user_id IS NOT NULL
  );
