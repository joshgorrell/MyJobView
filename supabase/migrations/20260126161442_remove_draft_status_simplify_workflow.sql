/*\n  # Remove Draft Status - Simplify Proposal Workflow\n\n  1. Changes\n    - Remove 'draft' status from proposals\n    - Migrate any existing 'draft' proposals to 'designing'\n    - Update constraint to only include: designing, ready_to_submit, sent, viewed, approved, approved_pending_action, expired, declined\n\n  2. Simplified Workflow\n    - designing → ready_to_submit → sent → viewed → approved/declined/expired\n*/\n\n-- First, migrate any existing draft proposals to designing\nUPDATE proposals \nSET status = 'designing' \nWHERE status = 'draft'

\n\n-- Drop and recreate the status constraint without 'draft'\nDO $$\nBEGIN\n  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check

\n\n  ALTER TABLE proposals ADD CONSTRAINT proposals_status_check\n    CHECK (status IN ('designing', 'ready_to_submit', 'sent', 'viewed', 'approved', 'approved_pending_action', 'expired', 'declined'))

\nEND $$

\n
