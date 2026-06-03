/*
  # Add Office Visibility Helper Functions
  
  ## Summary
  Creates functions and triggers for office-based visibility system.
*/

-- Helper function to check if user can view a record based on office/owner
CREATE OR REPLACE FUNCTION user_can_view_record(
  target_office_id uuid,
  target_created_by uuid
)
RETURNS boolean AS $$
DECLARE
  current_user_id uuid;
  current_user_role text;
  user_visibility text;
  user_primary_office uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Get current user's role and primary office
  SELECT role, primary_office_id INTO current_user_role, user_primary_office
  FROM profiles
  WHERE id = current_user_id;
  
  -- Admins and managers can see everything
  IF current_user_role IN ('admin', 'manager') THEN
    RETURN true;
  END IF;
  
  -- Get user's visibility setting (default to all_offices if not set)
  SELECT COALESCE(visibility_scope, 'all_offices') INTO user_visibility
  FROM user_visibility_settings
  WHERE user_id = current_user_id;
  
  -- If no setting exists, default to all_offices (backward compatible)
  IF user_visibility IS NULL THEN
    user_visibility := 'all_offices';
  END IF;
  
  -- Check visibility scope
  CASE user_visibility
    WHEN 'own_only' THEN
      -- Can only see own records
      RETURN target_created_by = current_user_id OR target_created_by IS NULL;
      
    WHEN 'office_only' THEN
      -- Can see records from their primary office
      IF user_primary_office IS NULL THEN
        -- If no primary office, fallback to own records
        RETURN target_created_by = current_user_id OR target_created_by IS NULL;
      END IF;
      RETURN target_office_id = user_primary_office 
        OR target_created_by = current_user_id 
        OR (target_office_id IS NULL AND target_created_by IS NULL);
      
    WHEN 'selected_offices' THEN
      -- Can see records from offices they're assigned to
      RETURN EXISTS (
        SELECT 1 FROM user_offices
        WHERE user_id = current_user_id
        AND office_id = target_office_id
      ) OR target_created_by = current_user_id 
        OR (target_office_id IS NULL AND target_created_by IS NULL);
      
    WHEN 'all_offices' THEN
      -- Can see everything
      RETURN true;
      
    ELSE
      -- Default to all offices for backward compatibility
      RETURN true;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's visibility scope (for UI)
CREATE OR REPLACE FUNCTION get_user_visibility_scope()
RETURNS text AS $$
DECLARE
  user_role text;
  visibility text;
BEGIN
  -- Get current user's role
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Admins/managers always have all_offices
  IF user_role IN ('admin', 'manager') THEN
    RETURN 'all_offices';
  END IF;
  
  -- Get user's setting
  SELECT COALESCE(visibility_scope, 'all_offices') INTO visibility
  FROM user_visibility_settings
  WHERE user_id = auth.uid();
  
  RETURN COALESCE(visibility, 'all_offices');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Trigger function to auto-populate office_id and created_by on insert
CREATE OR REPLACE FUNCTION set_record_office_and_owner()
RETURNS TRIGGER AS $$
DECLARE
  user_office uuid;
BEGIN
  -- Set created_by if not already set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  
  -- Set office_id if not already set
  IF NEW.office_id IS NULL THEN
    -- Get user's primary office
    SELECT primary_office_id INTO user_office
    FROM profiles
    WHERE id = auth.uid();
    
    NEW.office_id := user_office;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers to tables
DROP TRIGGER IF EXISTS trigger_set_proposal_office_owner ON proposals;
CREATE TRIGGER trigger_set_proposal_office_owner
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();

DROP TRIGGER IF EXISTS trigger_set_project_office_owner ON projects;
CREATE TRIGGER trigger_set_project_office_owner
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();

DROP TRIGGER IF EXISTS trigger_set_invoice_office_owner ON invoices;
CREATE TRIGGER trigger_set_invoice_office_owner
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();

DROP TRIGGER IF EXISTS trigger_set_lead_office_owner ON leads;
CREATE TRIGGER trigger_set_lead_office_owner
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_record_office_and_owner();
