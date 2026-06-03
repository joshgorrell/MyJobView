/*
  # Fix Service Request Status Constraint
  
  1. Changes
    - Drop old status check constraint
    - Add new status check constraint with correct values
    
  2. Valid Status Values
    - open: New service requests
    - scheduled: Service request has been scheduled  
    - in_progress: Work is in progress
    - closed: Service request completed
    - cancelled: Service request cancelled
*/

-- Drop the old constraint
ALTER TABLE service_requests 
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

-- Add the new constraint with correct values
ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_status_check 
  CHECK (status IN ('open', 'scheduled', 'in_progress', 'closed', 'cancelled'));
