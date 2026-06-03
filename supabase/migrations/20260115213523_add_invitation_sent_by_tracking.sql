/*
  # Add Invitation Sent By Tracking

  1. Changes
    - Add `invitation_sent_by_user_id` column to `security_contracts` table
    - Add foreign key to `profiles` table
    - Create index for performance

  2. Purpose
    - Track which staff member sent contract invitations
    - Display sender information in Security Onboarding interface
*/

-- Add invitation sent by tracking
ALTER TABLE security_contracts
ADD COLUMN IF NOT EXISTS invitation_sent_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_security_contracts_invitation_sent_by 
ON security_contracts(invitation_sent_by_user_id);

-- Add helpful comment
COMMENT ON COLUMN security_contracts.invitation_sent_by_user_id IS 'User ID of staff member who sent the contract invitation';
