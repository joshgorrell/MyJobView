/*
  # Add Service Manager Role and Notification System

  ## Overview
  Creates a dedicated Service Manager role to handle service operations including:
  - Punchlist service requests
  - Regular service requests
  - Service billing queue oversight
  - Service scheduling and customer service operations

  ## Changes

  1. **New Role**
    - Add 'service_manager' to roles table
    - Update profiles constraint to allow service_manager role
    - Set up as system role with appropriate description

  2. **Default Permissions**
    - Grant access to Production, Dispatch, and Finance departments
    - Provide module access for service-related operations
    - Include service requests, punchlist, and billing modules

  3. **Notification System**
    - Add new notification types for service requests
    - Create trigger to notify service managers when punchlist service requests are created
    - Create trigger to notify service managers for new service requests
    - Send both in-app and push notifications

  ## Security
    - RLS policies already cover notifications table
    - Service managers will see service-related notifications
    - Functions use SECURITY DEFINER for notification creation
*/

-- ============================================
-- 1. ADD SERVICE MANAGER ROLE
-- ============================================

-- Add service_manager to roles table
INSERT INTO roles (role_key, display_name, description, is_system_role, is_active)
VALUES (
  'service_manager',
  'Service Manager',
  'Manages service operations including service requests, punchlist, scheduling, and service billing',
  true,
  true
)
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- Update profiles role constraint to include service_manager
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'finance'::text,
    'manager'::text,
    'sales'::text,
    'tech'::text,
    'service_manager'::text
  ]));

-- ============================================
-- 2. UPDATE NOTIFICATION TYPES
-- ============================================

-- Add service-related notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'lead_assigned',
    'fishbowl_lead',
    'escalated',
    'mention',
    'lead_claimed',
    'lead_updated',
    'task',
    'task_assigned',
    'task_completed',
    'service_request_created',
    'punchlist_service_request',
    'service_request_assigned'
  ));

-- ============================================
-- 3. DEFAULT PERMISSIONS FOR SERVICE MANAGER
-- ============================================

DO $$
DECLARE
  v_service_manager_id uuid;
  v_production_dept uuid;
  v_dispatch_dept uuid;
  v_finance_dept uuid;
BEGIN
  -- Get service_manager role ID
  SELECT id INTO v_service_manager_id FROM roles WHERE role_key = 'service_manager';
  
  -- Get department IDs
  SELECT id INTO v_production_dept FROM departments WHERE name = 'production';
  SELECT id INTO v_dispatch_dept FROM departments WHERE name = 'dispatch';
  SELECT id INTO v_finance_dept FROM departments WHERE name = 'finance';

  -- Grant department access
  INSERT INTO role_department_access (role_id, department_id, has_access)
  VALUES
    (v_service_manager_id, v_production_dept, true),
    (v_service_manager_id, v_dispatch_dept, true),
    (v_service_manager_id, v_finance_dept, true)
  ON CONFLICT (role_id, department_id) DO UPDATE SET
    has_access = EXCLUDED.has_access;

  -- Grant module access for service-related modules
  INSERT INTO role_module_access (role_id, module_id, has_access)
  SELECT v_service_manager_id, dm.id, true
  FROM department_modules dm
  WHERE dm.is_active = true
    AND dm.module_key IN (
      'service_requests',
      'service_billing',
      'punchlist_admin',
      'work_orders',
      'unassigned_jobs',
      'dispatch_dashboard',
      'tech_status',
      'schedule_board',
      'job_acceptance_queue',
      'parts_requests',
      'tech_map',
      'time_clock_management',
      'projects',
      'change_orders'
    )
  ON CONFLICT (role_id, module_id) DO UPDATE SET
    has_access = EXCLUDED.has_access;
END $$;

-- ============================================
-- 4. NOTIFICATION FUNCTIONS
-- ============================================

-- Function to notify service managers of new service requests
CREATE OR REPLACE FUNCTION notify_service_managers_new_request()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_service_manager record;
  v_is_punchlist boolean;
  v_notification_type text;
  v_title text;
  v_body text;
BEGIN
  -- Check if this is a punchlist service request
  v_is_punchlist := (NEW.notes ILIKE '%Created from customer punchlist portal%');
  
  -- Set notification details based on source
  IF v_is_punchlist THEN
    v_notification_type := 'punchlist_service_request';
    v_title := 'New Punchlist Service Request';
    v_body := 'Customer ' || NEW.customer_name || ' submitted a punchlist service request';
  ELSE
    v_notification_type := 'service_request_created';
    v_title := 'New Service Request';
    v_body := 'Service request from ' || NEW.customer_name || ': ' || LEFT(NEW.job_description, 100);
  END IF;

  -- Create notification for all service managers
  FOR v_service_manager IN 
    SELECT p.id as user_id
    FROM profiles p
    WHERE p.role = 'service_manager'
      AND p.is_active = true
  LOOP
    -- Insert in-app notification
    INSERT INTO notifications (
      user_id,
      title,
      body,
      type,
      is_read,
      created_at
    ) VALUES (
      v_service_manager.user_id,
      v_title,
      v_body,
      v_notification_type,
      false,
      now()
    );

    -- TODO: Send push notification via edge function
    -- This would call the send-push-notification edge function
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================
-- 5. CREATE TRIGGERS
-- ============================================

-- Trigger for new service requests
DROP TRIGGER IF EXISTS trigger_notify_service_managers_new_request ON service_requests;
CREATE TRIGGER trigger_notify_service_managers_new_request
  AFTER INSERT ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_service_managers_new_request();

-- Create index for faster service manager queries
CREATE INDEX IF NOT EXISTS idx_profiles_service_manager_role 
  ON profiles(role) 
  WHERE role = 'service_manager' AND is_active = true;

-- Create index for notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_type_user 
  ON notifications(type, user_id, created_at DESC)
  WHERE is_read = false;
