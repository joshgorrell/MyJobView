/*
  # Optimize Proposals SELECT Policy
  
  1. Changes
    - Replace multiple EXISTS subqueries with a single CTE/subquery
    - Use profile data more efficiently
    - Reduce redundant profile lookups
    
  2. Performance
    - Single profile lookup instead of 4 separate EXISTS queries
    - Cleaner query plan execution
*/

-- Drop existing slow policy
DROP POLICY IF EXISTS "Users can view proposals with visibility scope" ON proposals;

-- Create optimized policy using a single profile lookup
CREATE POLICY "Users can view proposals with visibility scope"
  ON proposals
  FOR SELECT
  TO authenticated
  USING (
    -- Get user's profile data once
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        -- Admin sees all
        p.role = 'admin'
        -- Company-wide visibility
        OR p.proposal_visibility_scope = 'company'
        -- Office visibility (check office match)
        OR (
          p.proposal_visibility_scope = 'office'
          AND (
            proposals.office_id IS NULL
            OR proposals.office_id IN (
              SELECT office_id 
              FROM user_offices 
              WHERE user_id = auth.uid()
            )
          )
        )
        -- Own proposals only
        OR (
          p.proposal_visibility_scope = 'own'
          AND proposals.created_by = auth.uid()
        )
      )
    )
  );
