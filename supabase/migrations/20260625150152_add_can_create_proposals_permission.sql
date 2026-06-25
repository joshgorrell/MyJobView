ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_create_proposals boolean NOT NULL DEFAULT true;

-- Set false for roles that should never create proposals
UPDATE profiles
SET can_create_proposals = false
WHERE role IN ('technician', 'service_tech', 'portal_user', 'tech');
