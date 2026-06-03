/*
  # Update RLS Policies for New Roles - Simplified
  
  ## Summary
  Adds helper functions and updates core RLS policies to handle all user roles:
  - admin, sales, bd, project_manager, technician (staff)
  - portal_user (customers)
*/

-- Helper function to check if user is staff (not portal_user)
CREATE OR REPLACE FUNCTION is_staff_user()
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_role IN ('admin', 'sales', 'bd', 'project_manager', 'technician');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if user is manager level
CREATE OR REPLACE FUNCTION is_manager_user()
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_role IN ('admin', 'project_manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update user_can_view_record to handle all roles properly
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
  
  SELECT role, primary_office_id INTO current_user_role, user_primary_office
  FROM profiles
  WHERE id = current_user_id;
  
  -- Admins and managers can see everything
  IF current_user_role IN ('admin', 'manager', 'project_manager') THEN
    RETURN true;
  END IF;
  
  -- Portal users can't use this function (they have separate policies)
  IF current_user_role = 'portal_user' THEN
    RETURN false;
  END IF;
  
  -- For staff users (sales, bd, technician), check visibility settings
  SELECT COALESCE(visibility_scope, 'all_offices') INTO user_visibility
  FROM user_visibility_settings
  WHERE user_id = current_user_id;
  
  IF user_visibility IS NULL THEN
    user_visibility := 'all_offices';
  END IF;
  
  CASE user_visibility
    WHEN 'own_only' THEN
      RETURN target_created_by = current_user_id OR target_created_by IS NULL;
      
    WHEN 'office_only' THEN
      IF user_primary_office IS NULL THEN
        RETURN target_created_by = current_user_id OR target_created_by IS NULL;
      END IF;
      RETURN target_office_id = user_primary_office 
        OR target_created_by = current_user_id 
        OR (target_office_id IS NULL AND target_created_by IS NULL);
      
    WHEN 'selected_offices' THEN
      RETURN EXISTS (
        SELECT 1 FROM user_offices
        WHERE user_id = current_user_id
        AND office_id = target_office_id
      ) OR target_created_by = current_user_id 
        OR (target_office_id IS NULL AND target_created_by IS NULL);
      
    WHEN 'all_offices' THEN
      RETURN true;
      
    ELSE
      RETURN true;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update projects policy to support portal users
DROP POLICY IF EXISTS "Users can view projects based on office visibility" ON projects;

CREATE POLICY "Users can view projects based on office visibility"
  ON projects FOR SELECT
  TO authenticated
  USING (
    -- Staff users use office visibility
    (is_staff_user() AND user_can_view_record(office_id, created_by))
    -- Portal users can see projects for their contact
    OR (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = projects.contact_id
    ))
  );

-- Update proposals policy to support portal users
DROP POLICY IF EXISTS "Users can view proposals based on office visibility" ON proposals;

CREATE POLICY "Users can view proposals based on office visibility"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    -- Staff users use office visibility
    (is_staff_user() AND user_can_view_record(office_id, created_by))
    -- Portal users can see proposals for their contact
    OR (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = proposals.contact_id
    ))
  );

-- Update invoices policy to support portal users
DROP POLICY IF EXISTS "Users can view invoices based on office visibility" ON invoices;

CREATE POLICY "Users can view invoices based on office visibility"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    -- Staff users use office visibility
    (is_staff_user() AND user_can_view_record(office_id, created_by))
    -- Portal users can see invoices for their contact
    OR (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = invoices.contact_id
    ))
  );

-- Update tasks policy to allow technicians to see assigned tasks
DROP POLICY IF EXISTS "Users can view tasks based on office visibility" ON tasks;

CREATE POLICY "Users can view tasks based on office visibility"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    -- Own tasks
    assigned_to = auth.uid()
    -- Staff can view based on office visibility
    OR (is_staff_user() AND (
      (lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = tasks.lead_id
        AND user_can_view_record(leads.office_id, leads.created_by)
      ))
      OR (contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM contacts
        WHERE contacts.id = tasks.contact_id
        AND user_can_view_record(contacts.office_id, contacts.assigned_to)
      ))
    ))
  );

-- Allow users to update their assigned tasks
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON tasks;

CREATE POLICY "Users can update their assigned tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Update appointments policy to support technicians and portal users
DROP POLICY IF EXISTS "Users can view appointments" ON appointments;

CREATE POLICY "Users can view appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    -- Managers see all
    is_manager_user()
    -- Staff see appointments for visible contacts
    OR (is_staff_user() AND EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = appointments.contact_id
      AND user_can_view_record(contacts.office_id, contacts.assigned_to)
    ))
    -- Portal users see their own appointments
    OR (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = appointments.contact_id
    ))
    -- Assigned technicians can see appointments
    OR assigned_technician = auth.uid()
  );
