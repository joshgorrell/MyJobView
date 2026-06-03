/*
  # Grant Table Permissions on Proposals

  1. Changes
    - Grant ALL permissions to authenticated role on proposals table
    - This allows RLS policies to function properly
    - Without these grants, users get "permission denied" even with valid RLS policies
  
  2. Security
    - RLS policies still control actual access
    - Base grants are required for Supabase to work properly
*/

-- Grant all permissions on proposals table to authenticated role
GRANT ALL ON public.proposals TO authenticated;

-- Also grant on related tables
GRANT ALL ON public.proposal_line_items TO authenticated;
GRANT ALL ON public.proposal_rooms TO authenticated;
GRANT ALL ON public.proposal_versions TO authenticated;
