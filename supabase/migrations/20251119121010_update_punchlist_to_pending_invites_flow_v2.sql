/*
  # Update Punchlist to Pending Invites Flow v2

  ## Summary
  Changes from auto-granting access to a pending invite system where Electronic Life staff
  must manually review and send invites. Prevents duplicate invites for customers with
  multiple projects finishing.

  ## Changes

  ### New Table: pending_punchlist_invites
  Tracks potential Test & Tune invites that need admin review and approval.
  - `id` (uuid, primary key)
  - `contact_id` (uuid, references contacts) - Customer to potentially invite
  - `project_id` (uuid, references projects) - Project that triggered the invite
  - `status` (text) - pending, sent, declined, expired
  - `created_at` (timestamptz) - When invite was queued
  - `reviewed_by` (uuid, references profiles) - Staff who reviewed
  - `reviewed_at` (timestamptz) - When reviewed
  - `invite_sent_at` (timestamptz) - When invite was actually sent
  - `access_grant_id` (uuid, references punchlist_access_grants) - Created when sent
  - `decline_reason` (text) - Why invite was declined
  - `notes` (text) - Staff notes

  ## Unique Constraint
  Only one pending invite per contact at a time. This prevents duplicate invites
  when multiple projects complete for the same customer.

  ## Trigger Updates
  - Replace auto-grant trigger with auto-queue-invite trigger
  - Check for existing pending invites before creating new ones

  ## Security
  - Enable RLS
  - Staff can view all pending invites
  - Staff can review and send invites
*/

-- Create pending_punchlist_invites table
CREATE TABLE IF NOT EXISTS pending_punchlist_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'declined', 'expired')),
  created_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  invite_sent_at timestamptz,
  access_grant_id uuid REFERENCES punchlist_access_grants(id) ON DELETE SET NULL,
  decline_reason text,
  notes text
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pending_invites_contact ON pending_punchlist_invites(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_invites_project ON pending_punchlist_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_pending_invites_status ON pending_punchlist_invites(status);
CREATE INDEX IF NOT EXISTS idx_pending_invites_created ON pending_punchlist_invites(created_at DESC) WHERE status = 'pending';

-- Create partial unique index to prevent duplicate pending invites per contact
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invites_unique_contact_pending 
  ON pending_punchlist_invites(contact_id) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE pending_punchlist_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff can view pending invites"
  ON pending_punchlist_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "System can create pending invites"
  ON pending_punchlist_invites FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Staff can update pending invites"
  ON pending_punchlist_invites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'project_manager')
    )
  );

-- Drop the old auto-grant trigger
DROP TRIGGER IF EXISTS trigger_auto_grant_test_and_tune ON projects;
DROP FUNCTION IF EXISTS auto_grant_test_and_tune_access();

-- Create new function to queue pending invites instead of auto-granting
CREATE OR REPLACE FUNCTION queue_punchlist_invite()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if substantial_completion_date was just set
  IF (NEW.substantial_completion_date IS NOT NULL 
      AND (OLD.substantial_completion_date IS NULL OR OLD.substantial_completion_date != NEW.substantial_completion_date)) THEN
    
    -- Only queue if:
    -- 1. No existing pending invite for this contact
    -- 2. No active access grant for this contact
    -- 3. Contact doesn't already have VIP membership with punchlist access
    IF NOT EXISTS (
      SELECT 1 FROM pending_punchlist_invites 
      WHERE contact_id = NEW.contact_id 
      AND status = 'pending'
    ) AND NOT EXISTS (
      SELECT 1 FROM punchlist_access_grants
      WHERE contact_id = NEW.contact_id
      AND status = 'active'
      AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
    ) THEN
      
      -- Create pending invite for staff review
      INSERT INTO pending_punchlist_invites (
        contact_id,
        project_id,
        status,
        notes
      ) VALUES (
        NEW.contact_id,
        NEW.id,
        'pending',
        'Auto-queued on project substantial completion: ' || NEW.name
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to queue invites on project completion
CREATE TRIGGER trigger_queue_punchlist_invite
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION queue_punchlist_invite();

-- Create function for staff to send invite (creates access grant)
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

  -- Create the access grant
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

  -- Update the invite status
  UPDATE pending_punchlist_invites
  SET 
    status = 'sent',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    invite_sent_at = now(),
    access_grant_id = v_access_grant_id
  WHERE id = p_invite_id;

  RETURN v_access_grant_id;
END;
$$;

-- Create function for staff to decline invite
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

-- Create view for easier querying of pending invites with contact info
CREATE OR REPLACE VIEW pending_invites_with_details AS
SELECT 
  pi.id,
  pi.contact_id,
  pi.project_id,
  pi.status,
  pi.created_at,
  pi.reviewed_by,
  pi.reviewed_at,
  pi.invite_sent_at,
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
LEFT JOIN profiles reviewer ON reviewer.id = pi.reviewed_by;
