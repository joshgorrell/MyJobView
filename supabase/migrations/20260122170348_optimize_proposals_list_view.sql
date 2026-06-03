/*
  # Optimize Proposals List Loading Performance

  1. Changes
    - Create enhanced view that includes activity and message counts
    - Add indexes for faster queries
    - Pre-calculate unread messages count
    - Pre-calculate recent activity indicators
  
  2. Performance Impact
    - Reduces 3 queries to 1 query
    - Eliminates client-side data merging
    - Adds proper indexes for common filter patterns
  
  3. Notes
    - View includes revision count, activity indicators, and message counts
    - All data needed for list display is pre-calculated
    - Maintains compatibility with existing code
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS proposals_with_activity_summary CASCADE;

-- Create optimized view with activity and message counts
CREATE OR REPLACE VIEW proposals_with_activity_summary AS
SELECT 
  p.*,
  -- Revision count
  COALESCE((
    SELECT COUNT(*) 
    FROM proposals rev 
    WHERE rev.parent_proposal_id = p.id 
    AND rev.is_revision = true
  ), 0) as revision_count,
  -- Recent activity indicator (activity in last 7 days)
  EXISTS(
    SELECT 1 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id 
    AND pa.created_at > NOW() - INTERVAL '7 days'
  ) as has_recent_activity,
  -- Unread messages count
  COALESCE((
    SELECT COUNT(*) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id 
    AND pm.sender_type = 'customer'
    AND pm.is_read = false
  ), 0) as unread_messages_count,
  -- Total messages count
  COALESCE((
    SELECT COUNT(*) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id
  ), 0) as total_messages_count,
  -- Last activity date
  (
    SELECT MAX(created_at) 
    FROM proposal_activity pa 
    WHERE pa.proposal_id = p.id
  ) as last_activity_at,
  -- Last message date
  (
    SELECT MAX(created_at) 
    FROM proposal_messages pm 
    WHERE pm.proposal_id = p.id
  ) as last_message_at
FROM proposals p;

-- Grant access to authenticated users
GRANT SELECT ON proposals_with_activity_summary TO authenticated;

-- Add indexes to improve query performance for common filters
CREATE INDEX IF NOT EXISTS idx_proposals_status_created_at 
  ON proposals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_is_revision_created_at 
  ON proposals(is_revision, created_at DESC) 
  WHERE is_revision = false;

CREATE INDEX IF NOT EXISTS idx_proposals_expires_at 
  ON proposals(expires_at) 
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_created 
  ON proposal_activity(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_messages_proposal_unread 
  ON proposal_messages(proposal_id, is_read, sender_type);

-- Add index for search performance
CREATE INDEX IF NOT EXISTS idx_proposals_search 
  ON proposals USING gin(to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(proposal_number, '') || ' ' || 
    COALESCE(notes, '')
  ));

-- Comment on the view
COMMENT ON VIEW proposals_with_activity_summary IS 
  'Optimized view for proposals list that includes activity and message counts to avoid multiple queries';
