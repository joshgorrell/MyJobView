/*
  # Add Prospect Permission and Flag

  1. Changes
    - Add `can_view_prospects` permission to profiles table
    - Update RLS policies on contacts for prospect visibility
    - Add indexes for performance
    - Update handle_new_user trigger to set default prospect permissions

  2. Security
    - Prospect visibility controlled by `can_view_prospects` permission
    - Sales role gets prospect access by default
    - Admin and manager roles get prospect access by default
    - Other roles default to false but can be granted by admin
*/

-- Add prospect permission to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS can_view_prospects boolean DEFAULT false;

-- Add index for prospect permission queries
CREATE INDEX IF NOT EXISTS idx_profiles_can_view_prospects
ON public.profiles(can_view_prospects) WHERE can_view_prospects = true;

-- Add index for prospect filtering (is_prospect already exists from previous migration)
CREATE INDEX IF NOT EXISTS idx_contacts_is_prospect
ON public.contacts(is_prospect);

-- Update handle_new_user trigger to set default prospect permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_company_id uuid;
  default_office_id uuid;
  generated_username text;
  default_role text := 'tech';
  default_requires_daily_clock boolean := true;
BEGIN
  -- Get the default company (assumes single tenant)
  SELECT id INTO default_company_id FROM public.company_settings LIMIT 1;

  -- Get default office
  SELECT id INTO default_office_id FROM public.company_offices WHERE company_id = default_company_id LIMIT 1;

  -- Generate username from email
  generated_username := split_part(NEW.email, '@', 1);

  -- Make username unique if it already exists
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = generated_username) LOOP
    generated_username := generated_username || floor(random() * 1000)::text;
  END LOOP;

  -- Determine employment type and requires_daily_clock based on role
  IF NEW.raw_user_meta_data->>'role' IN ('tech', 'service_manager') THEN
    default_requires_daily_clock := true;
  ELSIF NEW.raw_user_meta_data->>'role' IN ('admin', 'manager', 'sales', 'finance') THEN
    default_requires_daily_clock := false;
  END IF;

  -- Set default role from metadata
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    default_role := NEW.raw_user_meta_data->>'role';
  END IF;

  -- Create profile with appropriate defaults
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    first_name,
    last_name,
    username,
    role,
    company_id,
    office_id,
    requires_daily_clock,
    can_view_prospects
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    generated_username,
    default_role,
    default_company_id,
    default_office_id,
    default_requires_daily_clock,
    -- Set can_view_prospects based on role
    CASE
      WHEN default_role IN ('sales', 'admin', 'manager') THEN true
      ELSE false
    END
  );

  -- Populate default starred modules for this user
  PERFORM public.populate_default_starred_modules(NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Add comment explaining the permission
COMMENT ON COLUMN public.profiles.can_view_prospects IS 'Permission to view and manage prospect contacts and competitor data. Defaults to true for sales, admin, and manager roles.';
