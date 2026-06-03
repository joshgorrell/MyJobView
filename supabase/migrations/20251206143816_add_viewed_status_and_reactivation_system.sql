/*
  # Add 'viewed' Status and Proposal Reactivation System

  1. Status Changes
    - Add 'viewed' status to proposals (set when customer first views proposal in portal)
    
  2. Reactivation Request System
    - Create `proposal_reactivation_requests` table to track customer requests
    - Automatically create task for sales rep when customer requests reactivation
    - Send notification to sales rep
    
  3. Security
    - RLS policies for reactivation requests
    - Only allow customers to request reactivation of their own expired proposals
*/

-- Add 'viewed' to status constraint
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check 
  CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'declined', 'expired'));

-- Create reactivation requests table
CREATE TABLE IF NOT EXISTS proposal_reactivation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requested_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  processed_at timestamptz,
  processed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_proposal 
  ON proposal_reactivation_requests(proposal_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_contact 
  ON proposal_reactivation_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_status 
  ON proposal_reactivation_requests(status) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE proposal_reactivation_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own reactivation requests"
  ON proposal_reactivation_requests FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'sales', 'sales_manager')
    )
  );

CREATE POLICY "Portal users can create reactivation requests"
  ON proposal_reactivation_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid()
    )
    AND
    proposal_id IN (
      SELECT id FROM proposals 
      WHERE contact_id = proposal_reactivation_requests.contact_id
      AND status = 'expired'
    )
  );

CREATE POLICY "Sales reps can update reactivation requests"
  ON proposal_reactivation_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'sales', 'sales_manager')
    )
  );

-- Function to handle reactivation request
CREATE OR REPLACE FUNCTION handle_proposal_reactivation_request()
RETURNS TRIGGER AS $$
DECLARE
  v_proposal record;
  v_task_id uuid;
  v_contact_name text;
  v_company_id uuid;
BEGIN
  -- Get proposal details
  SELECT 
    p.*,
    c.full_name as customer_name,
    c.contact_name as customer_contact_name,
    COALESCE(pr.company_id, (SELECT company_id FROM profiles LIMIT 1)) as company_id
  INTO v_proposal
  FROM proposals p
  JOIN contacts c ON c.id = p.contact_id
  LEFT JOIN profiles pr ON pr.id = p.created_by
  WHERE p.id = NEW.proposal_id;

  -- Determine contact name
  v_contact_name := COALESCE(v_proposal.customer_name, v_proposal.customer_contact_name, 'Customer');
  v_company_id := v_proposal.company_id;

  -- Create task for sales rep (assigned to proposal owner or general sales)
  INSERT INTO tasks (
    title,
    description,
    status,
    priority,
    assigned_to,
    contact_id,
    due_date,
    company_id
  ) VALUES (
    'Review & Reactivate Proposal ' || v_proposal.proposal_number,
    'Customer ' || v_contact_name || ' has requested reactivation of proposal ' || 
    v_proposal.proposal_number || '. Please review pricing, update if needed, and reactivate.',
    'pending',
    'high',
    COALESCE(v_proposal.created_by, v_proposal.sales_rep_id),
    NEW.contact_id,
    CURRENT_DATE + INTERVAL '1 day',
    v_company_id
  ) RETURNING id INTO v_task_id;

  -- Update reactivation request with task ID and sales rep
  UPDATE proposal_reactivation_requests
  SET 
    task_id = v_task_id,
    sales_rep_id = COALESCE(v_proposal.created_by, v_proposal.sales_rep_id)
  WHERE id = NEW.id;

  -- Create notification for sales rep
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    related_id,
    action_url
  ) VALUES (
    COALESCE(v_proposal.created_by, v_proposal.sales_rep_id),
    'Proposal Reactivation Request',
    v_contact_name || ' has requested reactivation of proposal ' || v_proposal.proposal_number,
    'proposal_reactivation',
    NEW.proposal_id,
    '/proposals?id=' || NEW.proposal_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for reactivation requests
DROP TRIGGER IF EXISTS trigger_handle_reactivation_request ON proposal_reactivation_requests;
CREATE TRIGGER trigger_handle_reactivation_request
  AFTER INSERT ON proposal_reactivation_requests
  FOR EACH ROW
  EXECUTE FUNCTION handle_proposal_reactivation_request();

-- Grant permissions
GRANT SELECT, INSERT ON proposal_reactivation_requests TO authenticated;
GRANT UPDATE ON proposal_reactivation_requests TO authenticated;

COMMENT ON TABLE proposal_reactivation_requests IS 'Tracks customer requests to reactivate expired proposals';
COMMENT ON COLUMN proposal_reactivation_requests.status IS 'pending: awaiting review, approved: reactivated, declined: rejected';
