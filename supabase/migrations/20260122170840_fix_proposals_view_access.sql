/*
  # Fix Proposals View Access

  1. Changes
    - Ensure the view inherits proper access from base tables
    - Grant necessary permissions to authenticated users
  
  2. Notes
    - Views in PostgreSQL apply RLS from underlying tables
    - This ensures authenticated users can access the view
*/

-- Ensure the view is accessible to authenticated users
GRANT SELECT ON proposals_with_activity_summary TO authenticated;

-- Also ensure anon can access for portal users
GRANT SELECT ON proposals_with_activity_summary TO anon;
