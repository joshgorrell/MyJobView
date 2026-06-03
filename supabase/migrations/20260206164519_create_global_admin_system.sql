/*
  # Create Global Admin System for MyJobView Platform
  
  1. New Columns
    - `profiles.is_global_admin` - Marks users as MyJobView global administrators
    - `organizations.plan_type` - 'trial', 'free', 'paid' to track account status
    
  2. Changes
    - Update organizations table to support trial management
    - Add RLS policies for global admin management
    - Create function to manage global admin access
    
  3. Security
    - Global admins can manage all organizations
    - Global admins can create other global admins
    - Global admins can set trial/free account status
    - Regular users cannot see global admin features
*/

-- Add global admin flag to profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_global_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_global_admin boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add plan_type to organizations for better trial/free management
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE organizations ADD COLUMN plan_type text DEFAULT 'paid' NOT NULL CHECK (plan_type IN ('trial', 'free', 'paid'));
  END IF;
END $$;

-- Add subscription status tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE organizations ADD COLUMN subscription_status text DEFAULT 'active' NOT NULL CHECK (subscription_status IN ('active', 'suspended', 'cancelled'));
  END IF;
END $$;

-- Add billing email
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'billing_email'
  ) THEN
    ALTER TABLE organizations ADD COLUMN billing_email text;
  END IF;
END $$;

-- Add index on is_global_admin for performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_global_admin ON profiles(is_global_admin) WHERE is_global_admin = true;

-- Create helper function to check if user is global admin
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_global_admin = true
  );
END;
$$;

-- Update profiles RLS to allow global admins to manage all profiles
DROP POLICY IF EXISTS "Global admins can manage all profiles" ON profiles;
CREATE POLICY "Global admins can manage all profiles"
  ON profiles
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

-- Create organizations RLS policies for global admins
DROP POLICY IF EXISTS "Global admins can view all organizations" ON organizations;
CREATE POLICY "Global admins can view all organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (public.is_global_admin());

DROP POLICY IF EXISTS "Global admins can manage all organizations" ON organizations;
CREATE POLICY "Global admins can manage all organizations"
  ON organizations
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

-- Create function to set user as global admin (only callable by existing global admins)
CREATE OR REPLACE FUNCTION public.set_global_admin_status(
  target_user_id uuid,
  is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is global admin
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Only global admins can modify global admin status';
  END IF;
  
  -- Update target user
  UPDATE profiles
  SET is_global_admin = is_admin,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- Create function to manage organization trial/free status
CREATE OR REPLACE FUNCTION public.set_organization_plan(
  org_id uuid,
  new_plan_type text,
  new_plan_tier text DEFAULT NULL,
  new_max_users integer DEFAULT NULL,
  new_trial_ends_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is global admin
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Only global admins can modify organization plans';
  END IF;
  
  -- Validate plan type
  IF new_plan_type NOT IN ('trial', 'free', 'paid') THEN
    RAISE EXCEPTION 'Invalid plan type. Must be trial, free, or paid';
  END IF;
  
  -- Update organization
  UPDATE organizations
  SET 
    plan_type = new_plan_type,
    plan_tier = COALESCE(new_plan_tier, plan_tier),
    max_users = COALESCE(new_max_users, max_users),
    trial_ends_at = new_trial_ends_at,
    updated_at = now()
  WHERE id = org_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_global_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_global_admin_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_plan TO authenticated;
