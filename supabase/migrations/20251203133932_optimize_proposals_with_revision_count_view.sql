/*
  # Optimize Proposals Revision Count View
  
  1. Changes
    - Replace correlated subqueries with LEFT JOINs and aggregation
    - Much faster execution by avoiding per-row subqueries
    
  2. Performance
    - Uses JOIN and GROUP BY instead of correlated subquery
    - Dramatically faster on large datasets
*/

-- Drop old slow view
DROP VIEW IF EXISTS proposals_with_revision_count;

-- Create optimized view using JOIN and aggregation
CREATE OR REPLACE VIEW proposals_with_revision_count AS
WITH revision_counts AS (
  SELECT 
    COALESCE(parent_proposal_id, id) as root_id,
    COUNT(*) as revision_count
  FROM proposals
  GROUP BY COALESCE(parent_proposal_id, id)
)
SELECT
  p.*,
  COALESCE(rc.revision_count, 1) as revision_count
FROM proposals p
LEFT JOIN revision_counts rc ON COALESCE(p.parent_proposal_id, p.id) = rc.root_id;

-- Grant access to view
GRANT SELECT ON proposals_with_revision_count TO authenticated;
