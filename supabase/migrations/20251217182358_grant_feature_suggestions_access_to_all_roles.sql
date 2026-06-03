/*
  # Grant Feature Suggestions Access to All Users

  1. Changes
    - Add role_module_access entries for all roles to access feature_suggestions
    - This makes the Feature Suggestions module visible in the footer for all users
    
  2. Security
    - All authenticated users can submit feature suggestions
    - Admins can manage/review all suggestions (already configured via RLS)
*/

-- Get the feature_suggestions module_id
DO $$
DECLARE
  v_module_id uuid;
  v_role_id uuid;
BEGIN
  -- Get the feature_suggestions module
  SELECT id INTO v_module_id
  FROM department_modules
  WHERE module_key = 'feature_suggestions'
  LIMIT 1;

  IF v_module_id IS NULL THEN
    RAISE NOTICE 'Feature suggestions module not found';
    RETURN;
  END IF;

  -- Grant access to all roles (except admin which already has it)
  FOR v_role_id IN 
    SELECT id FROM roles 
    WHERE is_active = true 
    AND role_key != 'admin'
  LOOP
    -- Insert or update to grant access
    INSERT INTO role_module_access (role_id, module_id, has_access)
    VALUES (v_role_id, v_module_id, true)
    ON CONFLICT (role_id, module_id) 
    DO UPDATE SET has_access = true;
  END LOOP;
  
  RAISE NOTICE 'Feature Suggestions access granted to all roles';
END $$;
