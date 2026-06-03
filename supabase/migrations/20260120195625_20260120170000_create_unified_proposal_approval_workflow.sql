/*
  # Unified Proposal Approval Workflow System

  ## Overview
  This migration creates a streamlined approval workflow that centralizes control with the sales rep
  and prevents duplicate customer notifications.

  ## New Tables

  ### 1. proposal_notifications
  Tracks all notifications sent for proposals to prevent duplicates
  - `id` (uuid, primary key)
  - `company_id` (uuid, references company)
  - `proposal_id` (uuid, references proposals)
  - `notification_type` (text: deposit_invoice_sent, approval_confirmation, po_confirmation, etc.)
  - `sent_at` (timestamptz)
  - `sent_by` (uuid, references profiles)
  - `recipient_email` (text)
  - `recipient_name` (text)
  - `method` (text: email, sms, portal)
  - `metadata` (jsonb: additional context like invoice_id, message content preview)

  ## New Proposal Statuses
  - 'approved_pending_action' - Approved but waiting for sales rep to choose deposit/PO action

  ## New Functions
  - `check_duplicate_notification()` - Checks if notification already sent within timeframe
  - `record_proposal_notification()` - Records a sent notification
  - `handle_deposit_billing_action()` - Explicit function for sales rep to trigger deposit billing
  - `handle_po_acceptance_action()` - Explicit function for sales rep to finalize PO acceptance

  ## Changes to Existing Logic
  - Removes automatic invoice creation from proposal approval trigger
  - Adds explicit action requirement before invoices are created
  - Centralizes all customer notifications through tracking system

  ## Security
  - RLS enabled on proposal_notifications
  - All authenticated users can view notifications for their company
  - Only sales reps and admins can create notifications
*/

-- ============================================================================
-- 1. Create proposal_notifications tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN (
    'deposit_invoice_sent',
    'approval_confirmation',
    'po_confirmation',
    'deposit_reminder',
    'proposal_sent',
    'proposal_viewed',
    'proposal_expired',
    'manual_email'
  )),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  method text NOT NULL DEFAULT 'email' CHECK (method IN ('email', 'sms', 'portal', 'manual')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_proposal_id
  ON proposal_notifications(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_company_id
  ON proposal_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_type_sent
  ON proposal_notifications(notification_type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_notifications_recipient
  ON proposal_notifications(recipient_email);

-- Enable RLS
ALTER TABLE proposal_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view proposal notifications for their company"
  ON proposal_notifications FOR SELECT
  TO authenticated
  USING (company_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Sales reps and admins can create proposal notifications"
  ON proposal_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'sales', 'sales_manager', 'service_manager')
      )
    )
  );

-- ============================================================================
-- 2. Update proposals table with new fields
-- ============================================================================

-- Add new status to constraint if not exists
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;

  -- Add new constraint with additional status
  ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'approved_pending_action', 'expired', 'declined'));
END $$;

-- Add tracking fields for sales rep actions
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS billing_action_taken boolean DEFAULT false;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS billing_action_type text CHECK (billing_action_type IN ('deposit_invoice', 'purchase_order', 'no_deposit_required'));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS billing_action_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS billing_action_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS customer_notified boolean DEFAULT false;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz;

-- Add index for pending actions query
CREATE INDEX IF NOT EXISTS idx_proposals_pending_actions
  ON proposals(status, approval_completed_at)
  WHERE status = 'approved_pending_action' AND billing_action_taken = false;

-- ============================================================================
-- 3. Helper Functions for Notification Management
-- ============================================================================

-- Function to check if a notification was already sent recently
CREATE OR REPLACE FUNCTION check_duplicate_notification(
  p_proposal_id uuid,
  p_notification_type text,
  p_hours_window integer DEFAULT 24
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM proposal_notifications
    WHERE proposal_id = p_proposal_id
    AND notification_type = p_notification_type
    AND sent_at > (now() - (p_hours_window || ' hours')::interval)
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- Function to record a notification
CREATE OR REPLACE FUNCTION record_proposal_notification(
  p_proposal_id uuid,
  p_notification_type text,
  p_recipient_email text,
  p_recipient_name text DEFAULT NULL,
  p_method text DEFAULT 'email',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
  v_company_id uuid;
BEGIN
  -- Get company_id from proposal
  SELECT company_id INTO v_company_id
  FROM proposals
  WHERE id = p_proposal_id;

  -- Insert notification record
  INSERT INTO proposal_notifications (
    company_id,
    proposal_id,
    notification_type,
    sent_by,
    recipient_email,
    recipient_name,
    method,
    metadata
  ) VALUES (
    v_company_id,
    p_proposal_id,
    p_notification_type,
    auth.uid(),
    p_recipient_email,
    p_recipient_name,
    p_method,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  -- Update proposal customer_notified fields
  UPDATE proposals
  SET
    customer_notified = true,
    customer_notified_at = now()
  WHERE id = p_proposal_id;

  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- 4. Sales Rep Action Functions
-- ============================================================================

-- Function for sales rep to explicitly request deposit payment
CREATE OR REPLACE FUNCTION handle_deposit_billing_action(
  p_proposal_id uuid,
  p_send_notification boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_invoice_id uuid;
  v_sales_order_id uuid;
  v_result jsonb;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Verify proposal is in correct status
  IF v_proposal.status NOT IN ('approved', 'approved_pending_action') THEN
    RAISE EXCEPTION 'Proposal must be approved before billing action';
  END IF;

  -- Verify deposit is required
  IF NOT v_proposal.require_deposit THEN
    RAISE EXCEPTION 'This proposal does not require a deposit';
  END IF;

  -- Create or update sales order with pending_deposit status
  IF v_proposal.sales_order_id IS NULL THEN
    -- Create new sales order
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_proposal.id,
      v_proposal.contact_id,
      REPLACE(v_proposal.proposal_number, 'PRO-', 'SO-'),
      'pending_deposit',
      v_proposal.total,
      auth.uid()
    )
    RETURNING id INTO v_sales_order_id;

    -- Update proposal with sales_order_id
    UPDATE proposals SET sales_order_id = v_sales_order_id WHERE id = p_proposal_id;
  ELSE
    -- Update existing sales order
    UPDATE sales_orders
    SET status = 'pending_deposit'
    WHERE id = v_proposal.sales_order_id
    RETURNING id INTO v_sales_order_id;
  END IF;

  -- Create deposit invoice if it doesn't exist
  IF v_proposal.deposit_invoice_id IS NULL THEN
    -- Generate invoice number
    DECLARE
      v_invoice_number text;
      v_max_number integer;
    BEGIN
      SELECT COALESCE(MAX(
        CASE
          WHEN invoice_number ~ '^\d+$' THEN invoice_number::integer
          ELSE 0
        END
      ), 0) INTO v_max_number
      FROM invoices
      WHERE company_id = v_proposal.company_id;

      v_invoice_number := LPAD((v_max_number + 1)::text, 5, '0');

      -- Create invoice
      INSERT INTO invoices (
        company_id,
        proposal_id,
        contact_id,
        invoice_number,
        invoice_type,
        status,
        subtotal,
        tax_amount,
        total,
        amount_paid,
        amount_due,
        created_by
      ) VALUES (
        v_proposal.company_id,
        v_proposal.id,
        v_proposal.contact_id,
        v_invoice_number,
        'deposit',
        'sent',
        v_proposal.deposit_amount_due,
        0,
        v_proposal.deposit_amount_due,
        0,
        v_proposal.deposit_amount_due,
        auth.uid()
      )
      RETURNING id INTO v_invoice_id;

      -- Add line item
      INSERT INTO invoice_line_items (
        company_id,
        invoice_id,
        description,
        quantity,
        unit_price,
        total
      ) VALUES (
        v_proposal.company_id,
        v_invoice_id,
        'Deposit for Proposal ' || v_proposal.proposal_number,
        1,
        v_proposal.deposit_amount_due,
        v_proposal.deposit_amount_due
      );

      -- Update proposal
      UPDATE proposals
      SET
        deposit_invoice_id = v_invoice_id,
        deposit_request_sent = true,
        deposit_request_sent_at = now()
      WHERE id = p_proposal_id;
    END;
  ELSE
    v_invoice_id := v_proposal.deposit_invoice_id;

    -- Update existing invoice to 'sent' if it was draft
    UPDATE invoices
    SET status = 'sent'
    WHERE id = v_invoice_id AND status = 'draft';
  END IF;

  -- Update proposal with billing action
  UPDATE proposals
  SET
    status = 'approved',
    billing_action_taken = true,
    billing_action_type = 'deposit_invoice',
    billing_action_at = now(),
    billing_action_by = auth.uid()
  WHERE id = p_proposal_id;

  -- Record notification if requested (but don't send - that's done by frontend/edge function)
  IF p_send_notification THEN
    PERFORM record_proposal_notification(
      p_proposal_id,
      'deposit_invoice_sent',
      (SELECT email FROM contacts WHERE id = v_proposal.contact_id),
      (SELECT full_name FROM contacts WHERE id = v_proposal.contact_id),
      'email',
      jsonb_build_object(
        'invoice_id', v_invoice_id,
        'sales_order_id', v_sales_order_id,
        'amount', v_proposal.deposit_amount_due
      )
    );
  END IF;

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'sales_order_id', v_sales_order_id,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- Function for sales rep to finalize PO acceptance
CREATE OR REPLACE FUNCTION handle_po_acceptance_action(
  p_proposal_id uuid,
  p_po_number text,
  p_po_file_url text DEFAULT NULL,
  p_send_notification boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_sales_order_id uuid;
  v_result jsonb;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Verify proposal is in correct status
  IF v_proposal.status NOT IN ('approved', 'approved_pending_action') THEN
    RAISE EXCEPTION 'Proposal must be approved before PO action';
  END IF;

  -- Verify PO is allowed as acceptance method
  IF NOT ('purchase_order' = ANY(v_proposal.acceptance_methods)) THEN
    RAISE EXCEPTION 'Purchase Order is not an allowed acceptance method for this proposal';
  END IF;

  -- Verify deposit is NOT required (PO only valid when no deposit)
  IF v_proposal.require_deposit THEN
    RAISE EXCEPTION 'Cannot use Purchase Order when deposit is required';
  END IF;

  -- Update proposal with PO details
  UPDATE proposals
  SET
    status = 'approved',
    accepted_via_method = 'purchase_order',
    purchase_order_number = p_po_number,
    purchase_order_file_url = p_po_file_url,
    billing_action_taken = true,
    billing_action_type = 'purchase_order',
    billing_action_at = now(),
    billing_action_by = auth.uid()
  WHERE id = p_proposal_id;

  -- Create or update sales order with planning status (ready to schedule)
  IF v_proposal.sales_order_id IS NULL THEN
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_proposal.id,
      v_proposal.contact_id,
      REPLACE(v_proposal.proposal_number, 'PRO-', 'SO-'),
      'planning',
      v_proposal.total,
      'Net 30',
      auth.uid()
    )
    RETURNING id INTO v_sales_order_id;

    UPDATE proposals SET sales_order_id = v_sales_order_id WHERE id = p_proposal_id;
  ELSE
    UPDATE sales_orders
    SET
      status = 'planning',
      payment_terms = 'Net 30'
    WHERE id = v_proposal.sales_order_id
    RETURNING id INTO v_sales_order_id;
  END IF;

  -- Record notification if requested
  IF p_send_notification THEN
    PERFORM record_proposal_notification(
      p_proposal_id,
      'po_confirmation',
      (SELECT email FROM contacts WHERE id = v_proposal.contact_id),
      (SELECT full_name FROM contacts WHERE id = v_proposal.contact_id),
      'email',
      jsonb_build_object(
        'sales_order_id', v_sales_order_id,
        'po_number', p_po_number
      )
    );
  END IF;

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'sales_order_id', v_sales_order_id,
    'po_number', p_po_number,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- Function for proposals that don't require deposit or PO
CREATE OR REPLACE FUNCTION handle_no_deposit_action(
  p_proposal_id uuid,
  p_send_notification boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_sales_order_id uuid;
  v_result jsonb;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Verify proposal is approved
  IF v_proposal.status NOT IN ('approved', 'approved_pending_action') THEN
    RAISE EXCEPTION 'Proposal must be approved';
  END IF;

  -- Create or update sales order with planning status
  IF v_proposal.sales_order_id IS NULL THEN
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_proposal.id,
      v_proposal.contact_id,
      REPLACE(v_proposal.proposal_number, 'PRO-', 'SO-'),
      'planning',
      v_proposal.total,
      auth.uid()
    )
    RETURNING id INTO v_sales_order_id;

    UPDATE proposals SET sales_order_id = v_sales_order_id WHERE id = p_proposal_id;
  ELSE
    UPDATE sales_orders
    SET status = 'planning'
    WHERE id = v_proposal.sales_order_id
    RETURNING id INTO v_sales_order_id;
  END IF;

  -- Update proposal
  UPDATE proposals
  SET
    status = 'approved',
    billing_action_taken = true,
    billing_action_type = 'no_deposit_required',
    billing_action_at = now(),
    billing_action_by = auth.uid()
  WHERE id = p_proposal_id;

  -- Record notification if requested
  IF p_send_notification THEN
    PERFORM record_proposal_notification(
      p_proposal_id,
      'approval_confirmation',
      (SELECT email FROM contacts WHERE id = v_proposal.contact_id),
      (SELECT full_name FROM contacts WHERE id = v_proposal.contact_id),
      'email',
      jsonb_build_object(
        'sales_order_id', v_sales_order_id
      )
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'sales_order_id', v_sales_order_id,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 5. Update Existing Trigger to Prevent Automatic Invoice Creation
-- ============================================================================

-- Drop the old automatic trigger
DROP TRIGGER IF EXISTS trigger_create_sales_order_from_proposal ON proposals;
DROP FUNCTION IF EXISTS create_sales_order_from_proposal();

-- New simplified trigger that only sets status to approved_pending_action
CREATE OR REPLACE FUNCTION set_proposal_pending_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status changes to approved
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Check if billing action already taken (e.g., via explicit function)
    IF NEW.billing_action_taken = false THEN
      -- Set to pending action status so sales rep must take explicit action
      NEW.status := 'approved_pending_action';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_proposal_pending_action
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION set_proposal_pending_action();

-- ============================================================================
-- 6. Grant Necessary Permissions
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON proposal_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION check_duplicate_notification TO authenticated;
GRANT EXECUTE ON FUNCTION record_proposal_notification TO authenticated;
GRANT EXECUTE ON FUNCTION handle_deposit_billing_action TO authenticated;
GRANT EXECUTE ON FUNCTION handle_po_acceptance_action TO authenticated;
GRANT EXECUTE ON FUNCTION handle_no_deposit_action TO authenticated;