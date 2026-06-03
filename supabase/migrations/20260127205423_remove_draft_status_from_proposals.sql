/*
  # Remove Draft Status from Proposals

  1. Changes
    - Remove 'draft' from the proposals status constraint
    - Update any existing proposals with 'draft' status to 'designing'
    - Simplify workflow: Designing → Ready to Submit → Sent → Viewed → Approved/Declined/Expired

  2. Status Flow
    - designing: Proposal is being designed (default status)
    - ready_to_submit: Proposal is complete and ready to send
    - sent: Sent to customer
    - viewed: Customer has viewed it
    - approved: Customer approved
    - approved_pending_action: Approved but waiting for PO or deposit
    - declined: Customer declined
    - expired: Proposal has expired
*/

-- Drop the existing constraint first
ALTER TABLE proposals
DROP CONSTRAINT IF EXISTS proposals_status_check;

-- Update any existing proposals with 'draft' status to 'designing'
UPDATE proposals
SET status = 'designing'
WHERE status = 'draft';

-- Add the new constraint without 'draft'
ALTER TABLE proposals
ADD CONSTRAINT proposals_status_check
CHECK (status IN ('designing', 'ready_to_submit', 'sent', 'viewed', 'approved', 'approved_pending_action', 'expired', 'declined'));
