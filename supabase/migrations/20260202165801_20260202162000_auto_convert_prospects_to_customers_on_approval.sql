/*
  # Auto-Convert Prospects to Customers on Proposal Approval

  ## Overview
  When a proposal is approved, the contact should automatically transition from prospect to customer.
  This migration updates all proposal approval functions to handle this conversion automatically.

  ## Changes
  1. Updates `handle_deposit_billing_action` to convert prospect to customer
  2. Updates `handle_po_acceptance_action` to convert prospect to customer
  3. Updates `handle_no_deposit_action` to convert prospect to customer
  4. Creates connection log entry documenting the conversion

  ## Business Logic
  - Sets `is_prospect = false` on the contact
  - Updates `contact_type` from 'lead' to 'person' if applicable
  - Creates a connection log entry for tracking
  - Only logs conversion if contact was actually a prospect (avoid duplicates)

  ## Security
  - Functions use SECURITY DEFINER to ensure proper permissions
  - All functions already have proper RLS policies
*/

-- ============================================================================
-- Helper function to convert prospect to customer and log the conversion
-- ============================================================================

CREATE OR REPLACE FUNCTION convert_prospect_to_customer(
  p_contact_id uuid,
  p_proposal_id uuid,
  p_proposal_number text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_prospect boolean;
  v_contact_name text;
  v_contact_type text;
BEGIN
  -- Get current prospect status and name
  SELECT is_prospect, full_name, contact_type
  INTO v_was_prospect, v_contact_name, v_contact_type
  FROM contacts
  WHERE id = p_contact_id;

  -- If not found, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Only proceed if they were actually a prospect
  IF v_was_prospect THEN
    -- Update contact to customer status
    UPDATE contacts
    SET
      is_prospect = false,
      contact_type = CASE
        WHEN contact_type = 'lead' THEN 'person'
        ELSE contact_type
      END,
      updated_at = now()
    WHERE id = p_contact_id;

    -- Log the conversion as a connection
    INSERT INTO connections (
      company_id,
      contact_id,
      connected_by,
      connection_type,
      description,
      follow_up_date,
      status
    )
    SELECT
      '00000000-0000-0000-0000-000000000001'::uuid,
      p_contact_id,
      auth.uid(),
      'conversion',
      'Converted from prospect to customer - Proposal ' || p_proposal_number || ' approved',
      NULL,
      'completed'
    WHERE NOT EXISTS (
      -- Avoid duplicate conversion logs
      SELECT 1 FROM connections
      WHERE contact_id = p_contact_id
      AND connection_type = 'conversion'
      AND description LIKE '%Proposal ' || p_proposal_number || '%'
    );

    RETURN true;
  END IF;

  -- Was already a customer
  RETURN false;
END;
$$;

-- ============================================================================
-- Update handle_deposit_billing_action to convert prospect to customer
-- ============================================================================

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
  v_converted boolean;
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

  -- Convert prospect to customer
  v_converted := convert_prospect_to_customer(
    v_proposal.contact_id,
    v_proposal.id,
    v_proposal.proposal_number
  );

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
    'notification_recorded', p_send_notification,
    'prospect_converted', v_converted
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- Update handle_po_acceptance_action to convert prospect to customer
-- ============================================================================

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
  v_converted boolean;
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

  -- Convert prospect to customer
  v_converted := convert_prospect_to_customer(
    v_proposal.contact_id,
    v_proposal.id,
    v_proposal.proposal_number
  );

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
    'notification_recorded', p_send_notification,
    'prospect_converted', v_converted
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- Update handle_no_deposit_action to convert prospect to customer
-- ============================================================================

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
  v_converted boolean;
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

  -- Convert prospect to customer
  v_converted := convert_prospect_to_customer(
    v_proposal.contact_id,
    v_proposal.id,
    v_proposal.proposal_number
  );

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
    'notification_recorded', p_send_notification,
    'prospect_converted', v_converted
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION convert_prospect_to_customer TO authenticated;

-- ============================================================================
-- Add comment for documentation
-- ============================================================================

COMMENT ON FUNCTION convert_prospect_to_customer IS
'Converts a prospect to a customer when a proposal is approved.
Updates is_prospect flag and contact_type, and creates a connection log entry.
Returns true if conversion happened, false if already a customer.';
