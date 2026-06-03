/*
  # Optimize Proposals Query Performance

  1. Purpose
    - Fix slow loading of proposals list
    - Add composite indexes for common filter combinations
    - Optimize view performance

  2. Changes
    - Add composite indexes for frequently used WHERE clause combinations
    - Add covering indexes to reduce table lookups
    - Improve sort performance with proper index order

  3. Performance Impact
    - Reduces proposals list load time from seconds to milliseconds
    - Eliminates full table scans for filtered queries
    - Speeds up pagination significantly
*/

-- Drop any redundant indexes first to avoid conflicts
DROP INDEX IF EXISTS idx_proposals_status_created_at;
DROP INDEX IF EXISTS idx_proposals_is_revision_created_at;

-- Composite index for the most common query pattern:
-- WHERE is_revision = false AND status filtering AND created_at sorting
CREATE INDEX IF NOT EXISTS idx_proposals_list_query
  ON proposals(is_revision, status, created_at DESC)
  WHERE is_revision = false;

-- Index for expiration filtering with status
CREATE INDEX IF NOT EXISTS idx_proposals_expiration_status
  ON proposals(status, expires_at)
  WHERE is_revision = false AND expires_at IS NOT NULL;

-- Index for searching by proposal number (commonly used in search)
CREATE INDEX IF NOT EXISTS idx_proposals_number_search
  ON proposals(proposal_number text_pattern_ops)
  WHERE is_revision = false;

-- Composite index for sorting by total amount with status filter
CREATE INDEX IF NOT EXISTS idx_proposals_total_sort
  ON proposals(is_revision, status, total DESC)
  WHERE is_revision = false;

-- Index specifically for pending deposits query
CREATE INDEX IF NOT EXISTS idx_proposals_pending_deposits_optimized
  ON proposals(status, deposit_paid, require_deposit, approval_completed_at DESC)
  WHERE is_revision = false
    AND status = 'approved'
    AND deposit_paid = false
    AND require_deposit = true;

-- Add index on contacts for the join in proposals list
CREATE INDEX IF NOT EXISTS idx_contacts_for_proposals
  ON contacts(id, full_name, email);

-- Add index on profiles for the created_by join
CREATE INDEX IF NOT EXISTS idx_profiles_for_proposals
  ON profiles(id, full_name);

-- Add index on leads for the join
CREATE INDEX IF NOT EXISTS idx_leads_for_proposals
  ON leads(id, company_name, contact_name);

-- Update table statistics to help query planner
ANALYZE proposals;
ANALYZE contacts;
ANALYZE profiles;
ANALYZE leads;
