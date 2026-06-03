/*
  # Add Unique Constraint on Email for Signup Attempts

  This allows us to upsert signup attempts by email, preventing duplicate entries.
*/

-- Add unique constraint on email (allow multiple for different statuses, but only one in_progress per email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_attempts_email_in_progress 
  ON signup_attempts(email) 
  WHERE status = 'in_progress';
