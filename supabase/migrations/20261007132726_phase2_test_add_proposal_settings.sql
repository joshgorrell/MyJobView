/*
# Phase 2 Test: Add proposal_settings for test proposal

The test proposal was created without proposal_settings, which
create_proposal_revision needs. Also clean up any orphaned partial
revision data from failed attempts.
*/

-- Clean up any orphaned partial revision proposals
DELETE FROM proposal_tasks WHERE proposal_id NOT IN (SELECT id FROM proposals);
DELETE FROM proposal_line_items WHERE proposal_id NOT IN (SELECT id FROM proposals);
DELETE FROM proposal_rooms WHERE proposal_id NOT IN (SELECT id FROM proposals);
DELETE FROM proposal_settings WHERE proposal_id NOT IN (SELECT id FROM proposals);

-- Insert minimal proposal_settings for the test proposal
INSERT INTO proposal_settings (proposal_id, deposit_percent, deposit_amount, payment_terms_type, require_deposit, organization_id)
SELECT '1ae71224-85c7-4c55-a918-8d247c4c825e', 50, 0, 'percentage', false, 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM proposal_settings WHERE proposal_id = '1ae71224-85c7-4c55-a918-8d247c4c825e'
);
