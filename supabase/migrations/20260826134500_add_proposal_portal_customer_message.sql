-- Personalized note shown with the currently published proposal.
-- Kept on the proposal so it can be edited on each delivery without affecting proposal content.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS portal_customer_message text;

COMMENT ON COLUMN proposals.portal_customer_message IS
  'Personalized note from the salesperson to the customer for the currently published portal proposal.';
