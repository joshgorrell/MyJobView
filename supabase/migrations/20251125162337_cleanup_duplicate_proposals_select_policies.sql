/*
  # Cleanup Duplicate Proposals SELECT Policies
  
  1. Changes
    - Remove old/duplicate SELECT policies on proposals
    - Keep only the new visibility scope policy
    - Keep portal user policy (different use case)
    
  2. Security
    - Single unified SELECT policy for internal users
    - Separate policy for portal users
*/

-- Drop old duplicate SELECT policies
DROP POLICY IF EXISTS "Sales can view all proposals" ON proposals;
DROP POLICY IF EXISTS "Techs can view proposals" ON proposals;

-- The "Users can view proposals with visibility scope" policy is already in place
-- The "Portal users can view their proposals" policy should remain for portal access
