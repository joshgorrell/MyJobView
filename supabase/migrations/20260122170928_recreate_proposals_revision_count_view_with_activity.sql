/*
  # Recreate Proposals View with Activity Data

  1. Changes
    - Drop and recreate proposals_with_revision_count view
    - Add activity and message counts for performance
  
  2. Benefits
    - Maintains existing view name for compatibility
    - Reduces database queries from 3 to 1
*/

-- Drop the existing view
DROP VIEW IF EXISTS proposals_with_revision_count CASCADE;

-- Recreate with enhanced data
CREATE VIEW proposals_with_revision_count AS
SELECT 
  p.*,
  -- Revision count (existing functionality)
  CASE
    WHEN p.is_revision THEN
      (SELECT COUNT(*) FROM proposals WHERE parent_proposal_id = p.parent_proposal_id OR id = p.parent_proposal_id)
    ELSE
      (SELECT COUNT(*) FROM proposals WHERE parent_proposal_id = p.id OR id = p.id)
  END as revision_count,
  -- NEW: Recent activity indicator (activity in last 7 days)
  EXISTS(
    SELECT 1 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id 
    AND pa.created_at > NOW() - INTERVAL '7 days'
  ) as has_recent_activity,
  -- NEW: Unread messages count
  COALESCE((
    SELECT COUNT(*) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id 
    AND pm.sender_type = 'customer'
    AND pm.is_read = false
  ), 0) as unread_messages_count,
  -- NEW: Total messages count
  COALESCE((
    SELECT COUNT(*) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id
  ), 0) as total_messages_count,
  -- NEW: Last activity date
  (
    SELECT MAX(created_at) 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id
  ) as last_activity_at,
  -- NEW: Last message date
  (
    SELECT MAX(created_at) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id
  ) as last_message_at
FROM proposals p;

-- Ensure proper access
GRANT SELECT ON proposals_with_revision_count TO authenticated;
GRANT SELECT ON proposals_with_revision_count TO anon;

-- Comment
COMMENT ON VIEW proposals_with_revision_count IS 
  'Enhanced view for proposals with revision count, activity indicators, and message counts for improved performance';
