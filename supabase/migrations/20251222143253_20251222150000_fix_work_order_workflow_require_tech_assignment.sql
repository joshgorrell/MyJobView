/*
  # Fix Work Order Workflow - Require Tech Assignment

  ## Summary
  Clarifies the distinction between Service Requests and Work Orders:
  - **Service Requests** = Preliminary/intake stage (no tech assigned, missing info, not ready to dispatch)
  - **Work Orders** = Finalized, assigned, ready to execute (MUST have tech assigned)

  ## Changes Made

  1. **Remove automatic work order creation from proposals:**
     - Drop trigger that auto-creates sales orders/projects when proposals are approved
     - Service Managers will manually create work orders as needed

  2. **Remove automatic work order creation from VIP appointments:**
     - Drop triggers that auto-create work orders for VIP/punchlist appointments
     - VIP requests should create service requests instead
     - Service Manager converts to work order when ready to dispatch

  3. **Make work order tech assignment required:**
     - Add NOT NULL constraint to work_orders.assigned_to
     - Update any existing work orders without assigned techs (convert to service requests)
     - This ensures all work orders are dispatch-ready

  4. **Remove "Unassigned Jobs" module:**
     - Remove from dispatch department navigation
     - If a job isn't ready to be assigned, it should be a service request, not a work order

  ## Migration Strategy
  - First, update any existing unassigned work orders (convert to service requests or assign)
  - Make project_id nullable for non-project work orders
  - Then add the NOT NULL constraint on assigned_to
  - Drop obsolete triggers last

  ## Security
  - Maintains existing RLS policies
  - No changes to permissions
*/

-- Step 1: Make project_id nullable since we have 6 work order types and not all need projects
ALTER TABLE work_orders
  ALTER COLUMN project_id DROP NOT NULL;

-- Update the constraint to only require project_id for project-type work orders (already exists from previous migration)
-- No action needed, constraint already exists

-- Step 2: Handle existing unassigned work orders
-- Convert any work orders without assigned_to to service requests

DO $$
DECLARE
  v_work_order RECORD;
  v_service_request_id uuid;
  v_next_number integer;
  v_sr_number text;
  v_company_id uuid;
BEGIN
  FOR v_work_order IN
    SELECT * FROM work_orders
    WHERE assigned_to IS NULL
  LOOP
    -- Get company_id (work_orders doesn't have it, get from contact or created_by)
    SELECT company_id INTO v_company_id
    FROM profiles
    WHERE id = v_work_order.created_by
    LIMIT 1;

    IF v_company_id IS NULL THEN
      RAISE NOTICE 'Skipping work order % - no company_id found', v_work_order.work_order_number;
      CONTINUE;
    END IF;

    -- Generate service request number
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM service_requests
    WHERE company_id = v_company_id;

    v_sr_number := 'SR-' || LPAD(v_next_number::text, 6, '0');

    -- Create service request from work order
    INSERT INTO service_requests (
      company_id,
      request_number,
      type,
      contact_id,
      description,
      priority,
      status,
      created_by,
      office_id,
      requested_date,
      notes
    ) VALUES (
      v_company_id,
      v_sr_number,
      v_work_order.type,
      v_work_order.contact_id,
      COALESCE(v_work_order.description, v_work_order.title),
      CASE v_work_order.priority
        WHEN 'urgent' THEN 'urgent'
        WHEN 'high' THEN 'urgent'
        ELSE 'medium'
      END,
      'pending',
      v_work_order.created_by,
      v_work_order.office_id,
      v_work_order.start_date,
      'Converted from unassigned work order: ' || v_work_order.work_order_number
    )
    RETURNING id INTO v_service_request_id;

    -- Delete the work order (we'll let Service Manager recreate when ready)
    DELETE FROM work_orders WHERE id = v_work_order.id;

    RAISE NOTICE 'Converted unassigned work order % to service request %',
      v_work_order.work_order_number, v_sr_number;
  END LOOP;
END $$;

-- Step 3: Make assigned_to required on work_orders
ALTER TABLE work_orders
  ALTER COLUMN assigned_to SET NOT NULL;

-- Add comment explaining the requirement
COMMENT ON COLUMN work_orders.assigned_to IS 'Required. Work orders must have an assigned technician. If tech is unknown or job needs review, create a Service Request instead.';

-- Step 4: Drop automatic work order creation triggers

-- Drop VIP appointment work order automation
DROP TRIGGER IF EXISTS on_vip_appointment_created ON appointments;
DROP TRIGGER IF EXISTS on_vip_appointment_updated ON appointments;
DROP FUNCTION IF EXISTS trigger_create_vip_work_order();
DROP FUNCTION IF EXISTS trigger_sync_vip_appointment_updates();

-- Drop proposal approval work order automation
DROP TRIGGER IF EXISTS trigger_create_sales_order_and_project ON proposals;
DROP TRIGGER IF EXISTS trigger_create_sales_order_from_proposal ON proposals;
DROP FUNCTION IF EXISTS create_sales_order_and_project_from_proposal();

-- Note: We're keeping create_sales_order_from_proposal() function as it may still be
-- called manually by Service Manager, but removing the automatic trigger

COMMENT ON FUNCTION create_sales_order_from_proposal() IS 'Creates sales order from approved proposal. NOTE: No longer triggered automatically. Service Manager must manually initiate.';

-- Step 5: Remove "Unassigned Jobs" module from navigation
DELETE FROM department_modules
WHERE module_key = 'unassigned-jobs'
  AND department_id = (SELECT id FROM departments WHERE name = 'dispatch');

-- Also remove from user starred modules if it exists
DELETE FROM user_starred_modules
WHERE module_id IN (
  SELECT id FROM department_modules WHERE module_key = 'unassigned-jobs'
);

-- Step 6: Update work order creation function documentation
COMMENT ON TABLE work_orders IS 'Finalized work orders ready for execution. Must have assigned technician. Use service_requests table for preliminary/unassigned work.';

-- Step 7: Add helper function to check if service request is ready for work order conversion
CREATE OR REPLACE FUNCTION can_convert_to_work_order(p_service_request_id uuid)
RETURNS TABLE (
  ready boolean,
  missing_fields text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sr RECORD;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_sr
  FROM service_requests
  WHERE id = p_service_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['Service request not found']::text[];
    RETURN;
  END IF;

  -- Check required fields
  IF v_sr.contact_id IS NULL THEN
    v_missing := array_append(v_missing, 'Contact');
  END IF;

  IF v_sr.description IS NULL OR trim(v_sr.description) = '' THEN
    v_missing := array_append(v_missing, 'Description');
  END IF;

  IF v_sr.type IS NULL THEN
    v_missing := array_append(v_missing, 'Service Type');
  END IF;

  -- Return results
  RETURN QUERY SELECT
    (array_length(v_missing, 1) IS NULL OR array_length(v_missing, 1) = 0),
    v_missing;
END;
$$;

GRANT EXECUTE ON FUNCTION can_convert_to_work_order(uuid) TO authenticated;

COMMENT ON FUNCTION can_convert_to_work_order(uuid) IS 'Validates if a service request has all required information to be converted to a work order. Used by Service Manager before creating work order.';