/*
  # Add Service Request Cancellation Trigger for Punchlist Tasks

  1. Changes
    - Create trigger to revert punchlist tasks to 'draft' status when service request is cancelled
    - Remove service_request_id from tasks when request is cancelled
    - This allows customers to re-submit the task if needed

  2. Trigger Logic
    - When a service_request status changes to 'cancelled'
    - Find all punchlist_tasks linked to that service request
    - Set their status back to 'draft' and clear service_request_id
*/

-- Create trigger function to handle service request cancellation
CREATE OR REPLACE FUNCTION handle_service_request_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If service request is being cancelled
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Revert all linked punchlist tasks back to draft status
    UPDATE punchlist_tasks
    SET
      status = 'draft',
      service_request_id = NULL,
      updated_at = now()
    WHERE service_request_id = NEW.id
    AND status = 'requested';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on service_requests
DROP TRIGGER IF EXISTS on_service_request_cancelled ON service_requests;

CREATE TRIGGER on_service_request_cancelled
  AFTER UPDATE ON service_requests
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled')
  EXECUTE FUNCTION handle_service_request_cancellation();
