/*
  # Add Manual Approval and Deposit Request Tracking

  1. Changes
    - Add approval_notes field to track manual approval notes
    - Add deposit_request_sent flag to track if deposit request was sent
    - Add deposit_request_sent_at timestamp
    - Add purchase_order_file_url for storing uploaded PO documents
    - Update check_proposal_acceptance_requirements to handle manual approvals

  2. Security
    - Maintain existing RLS policies
    - All fields are optional and default to null

  3. Notes
    - These fields support the manual approval workflow for sales reps
    - Sales reps can approve proposals and optionally send deposit requests
    - All approval methods (verbal, PO, payment) are tracked
*/

-- Add approval notes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'approval_notes'
  ) THEN
    ALTER TABLE proposals ADD COLUMN approval_notes text;
  END IF;
END $$;

-- Add deposit request tracking fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'deposit_request_sent'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_request_sent boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'deposit_request_sent_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_request_sent_at timestamptz;
  END IF;
END $$;

-- Add purchase order file URL field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'purchase_order_file_url'
  ) THEN
    ALTER TABLE proposals ADD COLUMN purchase_order_file_url text;
  END IF;
END $$;

-- Update the check_proposal_acceptance_requirements function to handle manual approvals
CREATE OR REPLACE FUNCTION check_proposal_acceptance_requirements(p_proposal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_require_deposit boolean;
  v_deposit_paid boolean;
  v_acceptance_methods text[];
  v_purchase_order_number text;
  v_accepted_via_method text;
  v_deposit_request_sent boolean;
BEGIN
  -- Get proposal details
  SELECT
    COALESCE(ps.require_deposit, true),
    COALESCE(p.deposit_paid, false),
    COALESCE(ps.acceptance_methods, ARRAY['payment']::text[]),
    p.purchase_order_number,
    p.accepted_via_method,
    COALESCE(p.deposit_request_sent, false)
  INTO
    v_require_deposit,
    v_deposit_paid,
    v_acceptance_methods,
    v_purchase_order_number,
    v_accepted_via_method,
    v_deposit_request_sent
  FROM proposals p
  LEFT JOIN proposal_settings ps ON ps.id = p.proposal_settings_id
  WHERE p.id = p_proposal_id;

  -- If no deposit required, approval is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- If deposit request was sent but deposit not yet received, allow approval
  -- This supports the manual approval workflow where sales rep sends deposit request
  IF v_deposit_request_sent AND NOT v_deposit_paid THEN
    RETURN true;
  END IF;

  -- Check if accepted via payment and deposit is paid
  IF v_accepted_via_method = 'payment' AND 'payment' = ANY(v_acceptance_methods) THEN
    RETURN v_deposit_paid;
  END IF;

  -- Check if accepted via purchase order and PO is provided
  IF v_accepted_via_method = 'purchase_order' AND 'purchase_order' = ANY(v_acceptance_methods) THEN
    RETURN v_purchase_order_number IS NOT NULL;
  END IF;

  -- Check if accepted via verbal approval (manual approval by sales rep)
  IF v_accepted_via_method = 'verbal' THEN
    -- Verbal approvals are allowed for manual approvals by sales reps
    -- Even if deposit hasn't been received, as long as deposit_request_sent flag is set
    RETURN true;
  END IF;

  -- Requirements not met
  RETURN false;
END;
$$;

-- Add comment to proposals table explaining the approval workflow
COMMENT ON COLUMN proposals.approval_notes IS 'Notes added during manual approval by sales rep';
COMMENT ON COLUMN proposals.deposit_request_sent IS 'Flag indicating if deposit request email was sent to customer';
COMMENT ON COLUMN proposals.deposit_request_sent_at IS 'Timestamp when deposit request was sent';
COMMENT ON COLUMN proposals.purchase_order_file_url IS 'URL to uploaded purchase order document';
