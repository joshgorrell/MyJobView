/*
  # Update Service Request to Work Order Conversion for New Types
  
  ## Summary
  Updates the automatic service request to work order conversion to use the new 6-type system:
  - Regular service requests create 'service' type work orders
  - Punchlist service requests create 'punchlist' type work orders
  - Maintains billable_type (billable/warranty) for proper billing queue routing
  
  ## Changes
  - Update convert_service_request_to_work_order function to detect punchlist origin
  - Set work order type to 'punchlist' when service request notes indicate punchlist source
  - Set work order type to 'service' for all other service requests
  - Preserve billable_type for service billing queue
  
  ## Notes
  - Punchlist work orders can be billable or warranty (from punchlist settings)
  - Service work orders are typically billable time & materials
  - Both types flow to service billing queue when billable_type = 'billable'
*/

-- Update the service request to work order conversion function
CREATE OR REPLACE FUNCTION convert_service_request_to_work_order()
RETURNS TRIGGER AS $$
DECLARE
  new_work_order_id uuid;
  v_work_order_type text;
BEGIN
  -- Only process if status is pending and no work order exists yet
  IF NEW.status = 'pending' AND NEW.work_order_id IS NULL THEN
    
    -- Determine work order type based on service request source
    IF NEW.notes LIKE '%punchlist%' OR 
       EXISTS (
         SELECT 1 FROM punchlist_tasks 
         WHERE service_request_id = NEW.id
       ) THEN
      v_work_order_type := 'punchlist';
    ELSE
      v_work_order_type := 'service';
    END IF;
    
    -- Create work order
    INSERT INTO work_orders (
      company_id,
      contact_id,
      title,
      description,
      type,
      status,
      priority,
      service_location_address,
      service_location_city,
      service_location_state,
      service_location_zip,
      billable_type,
      created_by
    ) VALUES (
      (SELECT company_id FROM profiles WHERE id = NEW.created_by LIMIT 1),
      NEW.contact_id,
      CASE 
        WHEN v_work_order_type = 'punchlist' THEN 'Punchlist Service'
        ELSE 'Service Request'
      END,
      NEW.job_description,
      v_work_order_type,
      'unscheduled',
      NEW.priority,
      NEW.job_location_address,
      NEW.job_location_city,
      NEW.job_location_state,
      NEW.job_location_zip,
      NEW.billable_type,
      NEW.created_by
    )
    RETURNING id INTO new_work_order_id;
    
    -- Update service request with work order link
    NEW.work_order_id = new_work_order_id;
    NEW.status = 'converted_to_work_order';
    
    -- Create activity feed entry
    INSERT INTO activity_feed (type, user_id, metadata)
    VALUES (
      'service_request_created',
      NEW.created_by,
      jsonb_build_object(
        'service_request_id', NEW.id,
        'work_order_id', new_work_order_id,
        'work_order_type', v_work_order_type,
        'customer_name', NEW.customer_name,
        'billable_by', NEW.billable_by
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (it already exists, but we're updating the function)
DROP TRIGGER IF EXISTS auto_convert_service_request_to_work_order ON service_requests;
CREATE TRIGGER auto_convert_service_request_to_work_order
  BEFORE INSERT ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION convert_service_request_to_work_order();

-- Add comment explaining the type detection logic
COMMENT ON FUNCTION convert_service_request_to_work_order() IS 'Auto-converts service requests to work orders. Sets type to punchlist if from punchlist portal, otherwise service. Preserves billable_type for billing queue routing.';
