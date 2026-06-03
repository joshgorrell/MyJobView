/*
  # Fix Service Manager Role Access

  ## Problem
  The service_manager role was added but the authentication helper functions 
  (is_manager, is_manager_user) weren't updated to recognize it. This prevents
  service managers from logging in and accessing the system.

  ## Changes
  1. Update is_manager() function to include:
     - admin (existing)
     - manager (missing)
     - service_manager (new role)
  
  2. Update is_manager_user() function to include:
     - admin (existing)
     - manager (missing)
     - service_manager (new role)

  ## Impact
  Service managers will now be able to:
  - Log in successfully
  - Access their profile
  - View and manage service-related data
  - Access all features assigned to their role
*/

-- ============================================
-- Update is_manager() function
-- ============================================
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager', 'service_manager')
  );
$$;

-- ============================================
-- Update is_manager_user() function
-- ============================================
CREATE OR REPLACE FUNCTION is_manager_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_role IN ('admin', 'manager', 'service_manager');
END;
$$;
