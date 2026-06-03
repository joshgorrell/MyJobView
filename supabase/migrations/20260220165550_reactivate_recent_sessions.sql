/*
  # Reactivate recent sessions

  Sessions created in the last 8 hours that were incorrectly closed by the
  beforeunload bug are restored to active so users immediately see their
  sessions in the viewer.
*/

UPDATE user_sessions
SET
  is_active = true,
  session_end = NULL
WHERE session_start > now() - INTERVAL '8 hours'
  AND is_active = false
  AND session_end IS NOT NULL
  AND session_end < session_start + INTERVAL '10 minutes';
