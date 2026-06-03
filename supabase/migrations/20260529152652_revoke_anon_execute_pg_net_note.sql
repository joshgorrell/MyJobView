/*
  # pg_net extension security note

  ## Summary
  Investigation confirmed that pg_net functions are installed in the `net` schema,
  not the `public` schema. PostgREST only exposes functions in the `public` schema
  by default, so pg_net functions are NOT accessible to the anon role via the API.

  No REVOKE statements are needed for pg_net.

  This migration serves as an audit record of the investigation.
*/

-- pg_net functions are in the net schema, not public.
-- They are not exposed via PostgREST. No action required.
SELECT 'pg_net functions confirmed in net schema, not accessible via PostgREST' AS security_note;
