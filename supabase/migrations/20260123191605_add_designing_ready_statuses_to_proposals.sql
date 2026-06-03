/*
  # Add Designing and Ready to Submit Statuses to Proposals

  1. Changes
    - Add 'designing' status (proposal is being designed, not ready to send)
    - Add 'ready_to_submit' status (proposal is complete and ready to send to customer)
    - Update status constraint to include new statuses
    - These new statuses come before 'sent' in the workflow

  2. Status Flow
    - designing -> ready_to_submit -> sent -> viewed -> approved/declined/expired
*/

-- Drop and recreate the status constraint with new statuses
DO $$
BEGIN
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;

  ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('designing', 'draft', 'ready_to_submit', 'sent', 'viewed', 'approved', 'approved_pending_action', 'expired', 'declined'));
END $$;
