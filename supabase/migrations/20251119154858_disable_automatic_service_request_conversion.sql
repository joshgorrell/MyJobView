/*
  # Disable Automatic Service Request to Work Order Conversion
  
  1. Changes
    - Drop the automatic trigger that converts service requests to work orders
    - Service requests should remain in queue for manual review and scheduling
    - Dispatch users will manually convert requests to work orders with proper scheduling
    
  2. Why
    - Service requests need human review before becoming work orders
    - Dispatch needs to assign techs, dates, and review details before scheduling
    - Automatic conversion bypasses critical workflow steps
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS auto_convert_service_request_to_work_order ON service_requests;
DROP TRIGGER IF EXISTS service_request_to_work_order_trigger ON service_requests;

-- Now drop the function
DROP FUNCTION IF EXISTS convert_service_request_to_work_order() CASCADE;