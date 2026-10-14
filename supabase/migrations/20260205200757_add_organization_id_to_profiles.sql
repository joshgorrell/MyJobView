/*\n  # Add organization_id to profiles\n\n  1. Changes\n    - Adds `organization_id` column to `profiles` table\n    - Backfills all existing profiles with the first organization's ID\n    - Creates `get_user_org_id()` helper function used in all RLS policies\n    - Adds index for performance\n    - Updates the org admin update policy to reference the new column\n\n  2. Security\n    - `get_user_org_id()` is STABLE and security definer for performance\n    - Used by every RLS policy to enforce tenant isolation\n*/\n\n-- Add column (nullable first for backfill)\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'organization_id'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\n\n-- Backfill all existing profiles with the first org\nUPDATE profiles\nSET organization_id = (SELECT id FROM organizations LIMIT 1)\nWHERE organization_id IS NULL

\n\n-- Now make it NOT NULL\nALTER TABLE profiles ALTER COLUMN organization_id SET NOT NULL

\n\n-- Add index\nCREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id)

\n\n-- Create the helper function used by all RLS policies\nCREATE OR REPLACE FUNCTION get_user_org_id()\nRETURNS uuid\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\n  SELECT organization_id FROM profiles WHERE id = auth.uid()

\n$$

\n\n-- Now update the organizations update policy to use the new column\nDROP POLICY IF EXISTS "Admins can update their organization" ON organizations

\nCREATE POLICY "Admins can update their organization"\n  ON organizations\n  FOR UPDATE\n  TO authenticated\n  USING (id = get_user_org_id())\n  WITH CHECK (id = get_user_org_id())

\n\n-- Add insert policy for org creation during signup flow\nCREATE POLICY "Service role can insert organizations"\n  ON organizations\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (false)

\n\n-- Update handle_new_user to include organization_id\nCREATE OR REPLACE FUNCTION handle_new_user()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_username text

\n  v_role text

\n  v_full_name text

\n  v_email text

\n  v_org_id uuid

\n  v_employment_type text

\n  v_requires_daily_clock boolean

\nBEGIN\n  v_email := NEW.email

\n  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1))

\n  v_username := COALESCE(\n    NEW.raw_user_meta_data->>'username',\n    lower(regexp_replace(split_part(v_email, '@', 1), '[^a-zA-Z0-9]', '', 'g'))\n  )

\n  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'sales')

\n  v_org_id := (NEW.raw_user_meta_data->>'organization_id')::uuid

\n\n  IF v_org_id IS NULL THEN\n    SELECT id INTO v_org_id FROM organizations LIMIT 1

\n  END IF

\n\n  IF v_role = 'tech' THEN\n    v_employment_type := 'hourly'

\n    v_requires_daily_clock := true

\n  ELSIF v_role IN ('admin', 'finance', 'manager') THEN\n    v_employment_type := 'salary_no_clock'

\n    v_requires_daily_clock := false

\n  ELSE\n    v_employment_type := 'salary'

\n    v_requires_daily_clock := false

\n  END IF

\n\n  BEGIN\n    INSERT INTO profiles (id, email, full_name, username, role, organization_id, employment_type, requires_daily_clock)\n    VALUES (NEW.id, v_email, v_full_name, v_username, v_role, v_org_id, v_employment_type, v_requires_daily_clock)

\n  EXCEPTION WHEN unique_violation THEN\n    v_username := v_username || '_' || substr(NEW.id::text, 1, 4)

\n    INSERT INTO profiles (id, email, full_name, username, role, organization_id, employment_type, requires_daily_clock)\n    VALUES (NEW.id, v_email, v_full_name, v_username, v_role, v_org_id, v_employment_type, v_requires_daily_clock)

\n  END

\n\n  BEGIN\n    INSERT INTO user_starred_modules (user_id, module_id, sort_order)\n    SELECT NEW.id, dsm.module_id, dsm.sort_order\n    FROM default_starred_modules dsm\n    WHERE dsm.role = v_role\n    ON CONFLICT DO NOTHING

\n  EXCEPTION WHEN OTHERS THEN\n    RAISE WARNING 'Failed to populate default starred modules for user %: %', NEW.id, SQLERRM

\n  END

\n\n  RETURN NEW

\nEND

\n$$

\n
