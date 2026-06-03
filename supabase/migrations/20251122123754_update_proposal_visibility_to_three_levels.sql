/*
  # Update Proposal Visibility to Three Levels

  1. Changes
    - Replace can_see_all_proposals boolean with proposal_visibility_scope enum
    - Three levels: 'own' (only mine), 'office' (my office), 'company' (all)
    - Add office_id to proposals table to track which office a proposal belongs to
    - Default to 'company' for backward compatibility
  
  2. Security
    - Maintains existing access patterns
    - Adds office-based visibility option
*/

-- Create enum for proposal visibility scope
DO $$ BEGIN
  CREATE TYPE proposal_visibility_scope AS ENUM ('own', 'office', 'company');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS proposal_visibility_scope proposal_visibility_scope DEFAULT 'company';

-- Migrate existing data: convert can_see_all_proposals to proposal_visibility_scope
UPDATE profiles
SET proposal_visibility_scope = CASE
  WHEN can_see_all_proposals = true THEN 'company'::proposal_visibility_scope
  WHEN can_see_all_proposals = false THEN 'own'::proposal_visibility_scope
  ELSE 'company'::proposal_visibility_scope
END
WHERE proposal_visibility_scope IS NULL OR proposal_visibility_scope = 'company';

-- Add office_id to proposals table
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES company_offices(id);

-- Create index for office-based queries
CREATE INDEX IF NOT EXISTS idx_proposals_office_id ON proposals(office_id);

-- Add comment
COMMENT ON COLUMN profiles.proposal_visibility_scope IS 
  'Controls proposal visibility: own (only created by me), office (my office only), company (all proposals)';

COMMENT ON COLUMN proposals.office_id IS 
  'Office location this proposal belongs to, used for office-based visibility filtering';

-- We'll keep can_see_all_proposals for now for backward compatibility
-- but proposal_visibility_scope takes precedence
