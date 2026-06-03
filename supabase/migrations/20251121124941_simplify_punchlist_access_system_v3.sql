/*
  # Simplify Punchlist Access System

  ## Summary
  Simplifies the punchlist invite system to match the desired workflow:
  - Pending invites are just a queue for staff to review
  - Once sent, they are removed from pending_invites and become active access grants
  - Access grants have 3 statuses: pending, active, expired
  - Expired grants can be renewed for another 90 days

  ## Changes
  
  ### 1. Clean up pending_punchlist_invites
  - Remove 'sent' records (they should be access grants now)
  - Update status constraint to only allow: pending, declined
  - Remove unused columns
  
  ### 2. Update punchlist_access_grants
  - Update status values to: pending, active, expired
  
  ### 3. Add renewal function
  - Allow renewing expired access for another 90 days
  
  ## Security
  - Maintain existing RLS policies
*/

-- First, clean up any 'sent' records in pending_punchlist_invites
DELETE FROM pending_punchlist_invites WHERE status = 'sent';

-- Update the access_grants table status constraint
ALTER TABLE punchlist_access_grants 
  DROP CONSTRAINT IF EXISTS punchlist_access_grants_status_check;

ALTER TABLE punchlist_access_grants
  ADD CONSTRAINT punchlist_access_grants_status_check 
  CHECK (status IN ('pending', 'active', 'expired'));

-- Update any existing 'converted_to_vip' statuses to 'expired'
UPDATE punchlist_access_grants 
SET status = 'expired' 
WHERE status = 'converted_to_vip';

-- Update pending_punchlist_invites status constraint
ALTER TABLE pending_punchlist_invites
  DROP CONSTRAINT IF EXISTS pending_punchlist_invites_status_check;

ALTER TABLE pending_punchlist_invites
  ADD CONSTRAINT pending_punchlist_invites_status_check
  CHECK (status IN ('pending', 'declined'));

-- Update any remaining weird statuses
UPDATE pending_punchlist_invites 
SET status = 'pending' 
WHERE status NOT IN ('pending', 'declined');

-- Drop and recreate the view without the removed columns
DROP VIEW IF EXISTS pending_invites_with_details;

-- Remove unused columns from pending_punchlist_invites
ALTER TABLE pending_punchlist_invites DROP COLUMN IF EXISTS invite_sent_at;
ALTER TABLE pending_punchlist_invites DROP COLUMN IF EXISTS access_grant_id;

-- Recreate the view
CREATE VIEW pending_invites_with_details AS
SELECT 
  pi.id,
  pi.contact_id,
  pi.project_id,
  pi.status,
  pi.created_at,
  pi.reviewed_by,
  pi.reviewed_at,
  pi.decline_reason,
  pi.notes,
  c.full_name as contact_name,
  c.email as contact_email,
  c.phone as contact_phone,
  p.name as project_name,
  p.project_number,
  p.substantial_completion_date,
  EXTRACT(DAY FROM (now() - pi.created_at)) as days_pending,
  reviewer.full_name as reviewed_by_name
FROM pending_punchlist_invites pi
INNER JOIN contacts c ON c.id = pi.contact_id
LEFT JOIN projects p ON p.id = pi.project_id
LEFT JOIN profiles reviewer ON reviewer.id = pi.reviewed_by
WHERE pi.status = 'pending';

-- Create function to renew expired access
CREATE OR REPLACE FUNCTION renew_punchlist_access(
  p_access_grant_id uuid,
  p_days integer DEFAULT 90
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant record;
BEGIN
  -- Get the access grant
  SELECT * INTO v_grant
  FROM punchlist_access_grants
  WHERE id = p_access_grant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access grant not found';
  END IF;

  -- Renew the access
  UPDATE punchlist_access_grants
  SET 
    status = 'active',
    granted_date = CURRENT_DATE,
    expiration_date = CURRENT_DATE + (p_days || ' days')::interval,
    updated_at = now()
  WHERE id = p_access_grant_id;
END;
$$;

-- Update the send_punchlist_invite function to remove the pending invite after creating access
CREATE OR REPLACE FUNCTION send_punchlist_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite record;
  v_access_grant_id uuid;
BEGIN
  -- Get the pending invite
  SELECT * INTO v_invite
  FROM pending_punchlist_invites
  WHERE id = p_invite_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  -- Check if contact already has active access
  IF EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = v_invite.contact_id
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Contact already has active punchlist access';
  END IF;

  -- Create the access grant with 'active' status
  INSERT INTO punchlist_access_grants (
    contact_id,
    access_type,
    project_id,
    granted_date,
    expiration_date,
    status,
    notes
  ) VALUES (
    v_invite.contact_id,
    'test_and_tune',
    v_invite.project_id,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '90 days',
    'active',
    'Granted via manual invite approval'
  )
  RETURNING id INTO v_access_grant_id;

  -- Remove the pending invite (it's now an active grant)
  DELETE FROM pending_punchlist_invites
  WHERE id = p_invite_id;

  RETURN v_access_grant_id;
END;
$$;

-- Update the decline function
CREATE OR REPLACE FUNCTION decline_punchlist_invite(
  p_invite_id uuid,
  p_decline_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pending_punchlist_invites
  SET 
    status = 'declined',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    decline_reason = p_decline_reason
  WHERE id = p_invite_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;
END;
$$;

-- Create a daily job function to mark expired access
CREATE OR REPLACE FUNCTION mark_expired_punchlist_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE punchlist_access_grants
  SET 
    status = 'expired',
    updated_at = now()
  WHERE status = 'active'
  AND expiration_date IS NOT NULL
  AND expiration_date < CURRENT_DATE;
END;
$$;
