/*
# Add app_url column to qbo_oauth_sessions

1. Modified Tables
- `qbo_oauth_sessions`: add `app_url` (text, nullable) column.
  Stores the frontend origin at OAuth initiation time so the callback
  can redirect the user's browser back to the correct deployed MyJobView
  URL instead of falling back to a hard-coded localhost.

2. Security
- No RLS changes. The column is written only by the initiate edge
  function (which verifies the caller is an authenticated admin) and
  read only by the callback edge function (service-role key).

3. Notes
- Column is nullable so existing rows (if any) remain valid.
- Idempotent: uses IF NOT EXISTS.
*/

ALTER TABLE qbo_oauth_sessions
  ADD COLUMN IF NOT EXISTS app_url text;
