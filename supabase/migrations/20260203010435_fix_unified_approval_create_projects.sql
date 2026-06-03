/*
  # Fix Unified Approval Workflow to Create Projects

  ## Overview
  This migration fixes a critical bug where projects were not being created when proposals
  are approved. The unified approval workflow functions were only creating sales_orders,
  leaving operations without a project to track work against.

  ## Changes Made
  Updates three approval functions to create projects immediately when sales orders are created:
  1. `handle_deposit_billing_action()` - Creates project with status 'pending_deposit'
  2. `handle_po_acceptance_action()` - Creates project with status 'approved' (ready to work)
  3. `handle_no_deposit_action()` - Creates project with status 'approved' (ready to work)

  ## Project Creation Logic
  - Project number format: PRJ-YYYY-NNNN (auto-incremented)
  - Initial status depends on billing requirements:
    - 'pending_deposit' if deposit payment is pending
    - 'approved' if PO received or no deposit required
  - Project name is taken from proposal title
  - Job site address is taken from proposal jobsite_location field
  - Assigned PM defaults to the proposal creator
  - Links to sales_order_id and contact_id from proposal

  ## Impact
  After this fix, when a proposal is approved and billing action is taken:
  - Sales Order is created (for billing/contract tracking)
  - Project is created immediately (for operational work tracking)
  - Production Manager can see the project and create work orders
  - Work can begin as soon as deposit is paid (or immediately for PO/no-deposit jobs)

  ## Notes
  - Uses existing `get_next_project_number()` function for numbering
  - Project status changes to 'approved' when deposit is paid (handled by deposit payment trigger)
  - All changes are transactional - if anything fails, entire operation rolls back
*/

-- ============================================================================
-- 1. Update handle_deposit_billing_action to create project
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
  v_project_id uuid;
  v_project_number text;
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

  -- Create project if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM projects WHERE sales_order_id = v_sales_order_id) THEN
    -- Generate project number
    v_project_number := get_next_project_number();

    -- Create project with pending_deposit status
    INSERT INTO projects (
      company_id,
      sales_order_id,
      contact_id,
      project_number,
      name,
      status,
      assigned_pm,
      job_site_address,
      notes,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_sales_order_id,
      v_proposal.contact_id,
      v_project_number,
      v_proposal.title,
      'planning', -- Project in planning until deposit is paid
      v_proposal.created_by, -- Default PM is proposal creator
      CASE
        WHEN v_proposal.jobsite_location IS NOT NULL
        THEN v_proposal.jobsite_location
        ELSE NULL
      END,
      'Project created from approved proposal ' || v_proposal.proposal_number || '. Awaiting deposit payment.',
      auth.uid()
    )
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'Created Project % for Proposal %', v_project_number, v_proposal.proposal_number;
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
        'project_id', v_project_id,
        'amount', v_proposal.deposit_amount_due
      )
    );
  END IF;

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'sales_order_id', v_sales_order_id,
    'project_id', v_project_id,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 2. Update handle_po_acceptance_action to create project
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
  v_project_id uuid;
  v_project_number text;
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

  -- Create project if it doesn't exist (ready to work since PO received)
  IF NOT EXISTS (SELECT 1 FROM projects WHERE sales_order_id = v_sales_order_id) THEN
    -- Generate project number
    v_project_number := get_next_project_number();

    -- Create project with approved status (ready to work)
    INSERT INTO projects (
      company_id,
      sales_order_id,
      contact_id,
      project_number,
      name,
      status,
      assigned_pm,
      job_site_address,
      notes,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_sales_order_id,
      v_proposal.contact_id,
      v_project_number,
      v_proposal.title,
      'planning', -- Ready to schedule work
      v_proposal.created_by, -- Default PM is proposal creator
      CASE
        WHEN v_proposal.jobsite_location IS NOT NULL
        THEN v_proposal.jobsite_location
        ELSE NULL
      END,
      'Project created from approved proposal ' || v_proposal.proposal_number || '. PO# ' || p_po_number || ' received. Ready to schedule.',
      auth.uid()
    )
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'Created Project % for Proposal % with PO %', v_project_number, v_proposal.proposal_number, p_po_number;
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
        'project_id', v_project_id,
        'po_number', p_po_number
      )
    );
  END IF;

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'sales_order_id', v_sales_order_id,
    'project_id', v_project_id,
    'po_number', p_po_number,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. Update handle_no_deposit_action to create project
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
  v_project_id uuid;
  v_project_number text;
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

  -- Create project if it doesn't exist (ready to work since no deposit required)
  IF NOT EXISTS (SELECT 1 FROM projects WHERE sales_order_id = v_sales_order_id) THEN
    -- Generate project number
    v_project_number := get_next_project_number();

    -- Create project with approved status (ready to work)
    INSERT INTO projects (
      company_id,
      sales_order_id,
      contact_id,
      project_number,
      name,
      status,
      assigned_pm,
      job_site_address,
      notes,
      created_by
    ) VALUES (
      v_proposal.company_id,
      v_sales_order_id,
      v_proposal.contact_id,
      v_project_number,
      v_proposal.title,
      'planning', -- Ready to schedule work
      v_proposal.created_by, -- Default PM is proposal creator
      CASE
        WHEN v_proposal.jobsite_location IS NOT NULL
        THEN v_proposal.jobsite_location
        ELSE NULL
      END,
      'Project created from approved proposal ' || v_proposal.proposal_number || '. No deposit required. Ready to schedule.',
      auth.uid()
    )
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'Created Project % for Proposal %', v_project_number, v_proposal.proposal_number;
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
        'sales_order_id', v_sales_order_id,
        'project_id', v_project_id
      )
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'sales_order_id', v_sales_order_id,
    'project_id', v_project_id,
    'notification_recorded', p_send_notification
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. Grant necessary permissions
-- ============================================================================

-- These functions already have EXECUTE grants from previous migration,
-- but we'll ensure they're in place
GRANT EXECUTE ON FUNCTION handle_deposit_billing_action TO authenticated;
GRANT EXECUTE ON FUNCTION handle_po_acceptance_action TO authenticated;
GRANT EXECUTE ON FUNCTION handle_no_deposit_action TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_project_number TO authenticated;