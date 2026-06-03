/*
  # Add Performance Indexes for Proposals
  
  1. New Indexes
    - Index on (is_revision, created_at) for list queries
    - Index on (office_id) for office-based visibility checks
    - Index on (created_by) for own-proposals visibility
    - Index on (status) for filtering
    
  2. Performance
    - Speeds up common query patterns
    - Improves RLS policy execution
*/

-- Index for loading non-revision proposals ordered by created_at
CREATE INDEX IF NOT EXISTS idx_proposals_is_revision_created_at 
  ON proposals(is_revision, created_at DESC) 
  WHERE is_revision = false;

-- Index for office-based visibility checks
CREATE INDEX IF NOT EXISTS idx_proposals_office_id 
  ON proposals(office_id) 
  WHERE office_id IS NOT NULL;

-- Index for created_by (own proposals visibility)
CREATE INDEX IF NOT EXISTS idx_proposals_created_by 
  ON proposals(created_by);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_proposals_status 
  ON proposals(status);

-- Index for contact_id (portal user access)
CREATE INDEX IF NOT EXISTS idx_proposals_contact_id 
  ON proposals(contact_id) 
  WHERE contact_id IS NOT NULL;

-- Composite index for expiration filtering
CREATE INDEX IF NOT EXISTS idx_proposals_expires_at 
  ON proposals(expires_at) 
  WHERE expires_at IS NOT NULL;
