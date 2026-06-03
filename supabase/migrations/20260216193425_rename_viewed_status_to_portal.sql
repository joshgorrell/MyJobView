/*
  # Rename "Viewed" Status to "Portal"

  1. Changes
    - Updates the status check constraint to allow both "viewed" and "portal" temporarily
    - Updates all existing proposals with status "viewed" to "portal"
    - Removes "viewed" from the constraint
    - This better indicates that the proposal is live on the customer portal
    
  2. Notes
    - The activity_type in proposal_activity table remains "viewed" (tracks the viewing action)
    - Only the proposal status is being renamed to "portal" (indicates the state)
*/

-- Step 1: Drop the old constraint
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;

-- Step 2: Add new constraint with both "viewed" and "portal" temporarily
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check 
  CHECK (status = ANY (ARRAY[
    'designing'::text, 
    'ready_to_submit'::text, 
    'sent'::text, 
    'viewed'::text,
    'portal'::text, 
    'approved'::text, 
    'approved_pending_action'::text, 
    'expired'::text, 
    'declined'::text, 
    'archived'::text
  ]));

-- Step 3: Update existing proposals with "viewed" status to "portal"
UPDATE proposals 
SET status = 'portal' 
WHERE status = 'viewed';

-- Step 4: Drop and recreate constraint without "viewed"
ALTER TABLE proposals DROP CONSTRAINT proposals_status_check;

ALTER TABLE proposals ADD CONSTRAINT proposals_status_check 
  CHECK (status = ANY (ARRAY[
    'designing'::text, 
    'ready_to_submit'::text, 
    'sent'::text, 
    'portal'::text, 
    'approved'::text, 
    'approved_pending_action'::text, 
    'expired'::text, 
    'declined'::text, 
    'archived'::text
  ]));
