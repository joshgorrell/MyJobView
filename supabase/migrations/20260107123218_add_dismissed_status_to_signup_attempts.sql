/*\n  # Add Dismissed Status to Signup Attempts\n\n  1. Changes\n    - Add 'dismissed' status to signup_attempts\n    - Allows admins to hide signup attempts from view without deleting the data\n    - Preserves customer progress if they return to complete signup\n\n  2. Security\n    - No RLS changes needed\n*/\n\n-- Add 'dismissed' to the allowed status values\nALTER TABLE signup_attempts\n  DROP CONSTRAINT IF EXISTS signup_attempts_status_check

\n\nALTER TABLE signup_attempts\n  ADD CONSTRAINT signup_attempts_status_check\n  CHECK (status IN ('in_progress', 'abandoned', 'completed', 'dismissed'))

\n\n-- Update the mark_abandoned_signups function to not affect dismissed entries\nCREATE OR REPLACE FUNCTION mark_abandoned_signups()\nRETURNS void\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nBEGIN\n  UPDATE signup_attempts\n  SET status = 'abandoned'\n  WHERE status = 'in_progress'\n  AND status != 'dismissed'\n  AND last_activity_at < now() - interval '24 hours'

\nEND

\n$$

\n
