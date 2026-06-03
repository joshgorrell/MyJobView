/*
  # Automate Customer Portal Approval Workflow

  ## Overview
  When customers approve proposals from the portal, automatically:
  1. Create sales order
  2. Create deposit invoice (if required) or finalize PO
  3. Notify the sales rep assigned to the proposal
  4. Skip the "pending action" status

  Internal approvals (via Manual Approval modal) still require explicit sales rep action.

  ## Changes
  - Updates trigger to detect portal vs. internal approvals
  - Adds automatic notification to sales rep
  - Calls appropriate billing functions for portal approvals
*/

-- ============================================================================
-- 1. Function to notify sales rep of customer approval
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_sales_rep_of_approval(
  p_proposal_id uuid,
  p_customer_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_assigned_to uuid;
  v_message text;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;

  -- Get assigned sales rep (owner or created_by)
  v_assigned_to := COALESCE(v_proposal.assigned_to, v_proposal.created_by);

  IF v_assigned_to IS NULL THEN
    RETURN; -- No one to notify
  END IF;

  -- Build notification message based on deposit requirement
  IF v_proposal.require_deposit THEN
    IF v_proposal.accepted_via_method = 'verbal' THEN
      v_message := p_customer_name || ' approved proposal ' || v_proposal.proposal_number ||
                   '. A deposit invoice has been created and sent to the customer. Sales order is pending deposit payment.';
    ELSE
      v_message := p_customer_name || ' approved proposal ' || v_proposal.proposal_number ||
                   ' with purchase order #' || COALESCE(v_proposal.purchase_order_number, 'N/A') ||
                   '. Sales order has been created and is ready for scheduling.';
    END IF;
  ELSE
    v_message := p_customer_name || ' approved proposal ' || v_proposal.proposal_number ||
                 '. Sales order has been created and is ready for scheduling.';
  END IF;

  -- Create notification for the sales rep
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    related_id,
    created_at
  ) VALUES (
    v_assigned_to,
    'proposal_approved',
    'Customer Approved Proposal',
    v_message,
    p_proposal_id,
    now()
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to notify sales rep: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 2. Enhanced trigger for automatic portal approval processing
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_proposal_approval_automatic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_portal_approval boolean;
  v_customer_name text;
  v_result jsonb;
BEGIN
  -- Only act when status changes to approved
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN

    -- Check if this is a customer portal approval
    -- Portal approvals have approval_completed_at set and accepted_via_method defined
    v_is_portal_approval := (
      NEW.approval_completed_at IS NOT NULL
      AND NEW.accepted_via_method IS NOT NULL
      AND OLD.approval_completed_at IS NULL
    );

    -- If this is a portal approval, handle it automatically
    IF v_is_portal_approval THEN

      -- Get customer name for notifications
      SELECT COALESCE(full_name, contact_name, email, 'Customer')
      INTO v_customer_name
      FROM contacts
      WHERE id = NEW.contact_id;

      -- Handle based on acceptance method and deposit requirement
      IF NEW.accepted_via_method = 'purchase_order' THEN
        -- PO approval - no deposit required
        BEGIN
          SELECT handle_no_deposit_action(NEW.id, false) INTO v_result;
          NEW.billing_action_taken := true;
          NEW.billing_action_type := 'purchase_order';
          NEW.billing_action_at := now();
          NEW.billing_action_by := NEW.approved_by;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to process PO approval: %', SQLERRM;
        END;

      ELSIF NEW.accepted_via_method = 'verbal' AND NEW.require_deposit THEN
        -- Verbal approval with deposit - create deposit invoice
        BEGIN
          SELECT handle_deposit_billing_action(NEW.id, false) INTO v_result;
          NEW.billing_action_taken := true;
          NEW.billing_action_type := 'deposit_invoice';
          NEW.billing_action_at := now();
          NEW.billing_action_by := NEW.approved_by;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to create deposit invoice: %', SQLERRM;
        END;

      ELSE
        -- No deposit required, create sales order directly
        BEGIN
          SELECT handle_no_deposit_action(NEW.id, false) INTO v_result;
          NEW.billing_action_taken := true;
          NEW.billing_action_type := 'no_deposit_required';
          NEW.billing_action_at := now();
          NEW.billing_action_by := NEW.approved_by;
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to process no-deposit approval: %', SQLERRM;
        END;
      END IF;

      -- Notify the assigned sales rep
      BEGIN
        PERFORM notify_sales_rep_of_approval(NEW.id, v_customer_name);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to notify sales rep: %', SQLERRM;
      END;

    ELSE
      -- This is an internal approval (manual approval modal)
      -- Set to pending action so sales rep must explicitly choose action
      IF NEW.billing_action_taken = false THEN
        NEW.status := 'approved_pending_action';
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS trigger_set_proposal_pending_action ON proposals;
DROP TRIGGER IF EXISTS trigger_handle_proposal_approval_automatic ON proposals;

CREATE TRIGGER trigger_handle_proposal_approval_automatic
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION handle_proposal_approval_automatic();

-- ============================================================================
-- 3. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION notify_sales_rep_of_approval TO authenticated;
GRANT EXECUTE ON FUNCTION handle_proposal_approval_automatic TO authenticated;
