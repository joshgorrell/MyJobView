/*
  # Fix Service Request to Work Order Trigger - Add company_id
  
  1. Changes
    - Update trigger to include company_id when creating work orders
    - Gets company_id from company_settings (single-tenant system)
    
  2. Why
    - work_orders table requires company_id NOT NULL
    - Previous trigger was missing this field causing constraint violations
*/

-- Drop and recreate the function with company_id support
CREATE OR REPLACE FUNCTION convert_service_request_to_work_order()
RETURNS TRIGGER AS $$
DECLARE
  new_work_order_id uuid;
  v_company_id uuid;
BEGIN
  -- Only process if status is open and no work order exists yet
  IF NEW.status = 'open' AND NEW.work_order_id IS NULL THEN
    -- Get the company_id (single-tenant, should only be one)
    SELECT id INTO v_company_id FROM company_settings LIMIT 1;
    
    -- Create work order with company_id
    INSERT INTO work_orders (
      company_id,
      contact_id,
      description,
      status,
      priority,
      service_location_address,
      service_location_city,
      service_location_state,
      service_location_zip,
      billable_type,
      created_by
    ) VALUES (
      v_company_id,
      NEW.contact_id,
      NEW.job_description,
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
    NEW.status = 'scheduled';
    
    -- Create activity feed entry
    INSERT INTO activity_feed (type, user_id, metadata)
    VALUES (
      'service_request_created',
      NEW.created_by,
      jsonb_build_object(
        'service_request_id', NEW.id,
        'work_order_id', new_work_order_id,
        'customer_name', NEW.customer_name,
        'billable_by', NEW.billable_by
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;