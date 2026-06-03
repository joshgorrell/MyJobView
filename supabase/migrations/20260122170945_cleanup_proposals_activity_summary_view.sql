/*
  # Cleanup Redundant View

  1. Changes
    - Drop proposals_with_activity_summary view (no longer needed)
    - All functionality moved to proposals_with_revision_count view
*/

-- Drop the redundant view
DROP VIEW IF EXISTS proposals_with_activity_summary CASCADE;
