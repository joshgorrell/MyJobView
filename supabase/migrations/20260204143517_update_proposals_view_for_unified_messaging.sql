/*
  # Update Proposals View for Unified Messaging
  
  1. Changes
    - Update proposals_with_revision_count view to use unified messaging system
    - Use message_threads and messages instead of proposal_messages
    - Maintain backward compatibility with unread_messages_count field
    - Add unread_customer_messages_count directly from proposals table for performance
  
  2. Benefits
    - Integrates with new unified messaging system
    - Maintains existing view name and field names for compatibility
*/

-- Drop the existing view
DROP VIEW IF EXISTS proposals_with_revision_count CASCADE;

-- Recreate with unified messaging system
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
  -- Recent activity indicator (activity in last 7 days)
  EXISTS(
    SELECT 1 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id 
    AND pa.created_at > NOW() - INTERVAL '7 days'
  ) as has_recent_activity,
  -- Unread messages count from proposals table (uses unified messaging)
  COALESCE(p.unread_customer_messages_count, 0) as unread_messages_count,
  -- Total messages count from unified system
  COALESCE((
    SELECT COUNT(*) 
    FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
  ), 0) as total_messages_count,
  -- Last activity date
  (
    SELECT MAX(created_at) 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id
  ) as last_activity_at,
  -- Last message date from unified system
  (
    SELECT MAX(m.created_at) 
    FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
  ) as last_message_at
FROM proposals p;

-- Ensure proper access
GRANT SELECT ON proposals_with_revision_count TO authenticated;
GRANT SELECT ON proposals_with_revision_count TO anon;

-- Comment
COMMENT ON VIEW proposals_with_revision_count IS 
  'Enhanced view for proposals with revision count, activity indicators, and message counts using unified messaging system';
