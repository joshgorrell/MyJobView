/*
  # Add composite indexes for proposals list query performance

  The main proposals list query filters on:
    - is_revision = false (always)
    - status (frequently filtered)
    - expires_at (for expiration filter)
    - created_at (default sort)

  The revision count subquery in the view groups on:
    - COALESCE(parent_proposal_id, id)

  Add composite indexes to support the most common access patterns.
*/

-- Primary composite index: list query default sort (is_revision=false, sorted by created_at DESC)
CREATE INDEX IF NOT EXISTS idx_proposals_list_query
  ON proposals (is_revision, created_at DESC)
  WHERE is_revision = false;

-- Composite index for status + created_at (status filtering is very common)
CREATE INDEX IF NOT EXISTS idx_proposals_list_status_created
  ON proposals (is_revision, status, created_at DESC)
  WHERE is_revision = false;

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_proposals_list_expires
  ON proposals (is_revision, expires_at)
  WHERE is_revision = false AND expires_at IS NOT NULL;

-- Index for revision count subquery (the grouped COALESCE expression)
CREATE INDEX IF NOT EXISTS idx_proposals_revision_root
  ON proposals (COALESCE(parent_proposal_id, id));

-- Index on proposal_activity for the last_activity_at aggregate in the view
CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_created
  ON proposal_activity (proposal_id, created_at DESC);

ANALYZE proposals;
