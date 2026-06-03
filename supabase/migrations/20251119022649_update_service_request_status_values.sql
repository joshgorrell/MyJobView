/*
  # Update Service Request Status Values
  
  1. Changes
    - Update default status from 'pending' to 'open'
    - Migrate any existing 'pending' records to 'open' status
    
  2. Status Values
    - open: New service requests
    - scheduled: Service request has been scheduled
    - in_progress: Work is in progress
    - closed: Service request completed
    - cancelled: Service request cancelled
*/

-- Update default status value
ALTER TABLE service_requests 
  ALTER COLUMN status SET DEFAULT 'open';

-- Migrate any existing pending records to open
UPDATE service_requests 
SET status = 'open' 
WHERE status = 'pending';
