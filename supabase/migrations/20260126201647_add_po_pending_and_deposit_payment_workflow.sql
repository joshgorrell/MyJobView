/*
  # Add PO Pending and Deposit Payment Workflow

  ## Changes
  
  ### 1. Purchase Order Workflow
  - Add `po_pending` flag to track when approval happened but PO number not provided yet
  - Add `po_document_url` for PDF upload of PO document (optional)
  - Allow approval without PO number (sets po_pending = true)
  - When PO number is added later, clear po_pending flag and proceed normally
  
  ### 2. Deposit Payment Workflow  
  - Customers can pay deposit invoices via portal (QuickBooks integration)
  - Sales reps can record deposit payments (check, cash, credit card, etc)
  - When deposit is paid, automatically update sales order from "pending_deposit" to "planning"
  
  ### 3. New Notification Types
  - po_number_needed - Notify sales rep when customer approves but needs PO
  - deposit_invoice_paid - Notify sales rep when deposit is paid
*/

-- ============================================================================
-- 1. Add PO Pending Fields
-- ============================================================================

-- Add po_pending flag to track approvals waiting for PO number
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS po_pending boolean DEFAULT false;

-- Add field for PO document PDF upload
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS po_document_url text;

-- Add indexes for PO queries
CREATE INDEX IF NOT EXISTS idx_proposals_po_pending 
  ON proposals(po_pending) 
  WHERE po_pending = true;

CREATE INDEX IF NOT EXISTS idx_proposals_purchase_order_number 
  ON proposals(purchase_order_number) 
  WHERE purchase_order_number IS NOT NULL;

-- ============================================================================
-- 2. Update Unified Approval Handler to Support PO Pending
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_unified_proposal_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_deposit_amount numeric;
  v_require_deposit boolean;
  v_accepted_via_method text;
  v_customer_name text;
  v_sales_order_status text;
  v_payment_id uuid;
BEGIN
  -- Only process when status changes to approved AND no sales order exists yet
  IF NEW.status = 'approved'
     AND OLD.status != 'approved'
     AND NEW.sales_order_id IS NULL
     AND NEW.billing_action_taken = false
  THEN

    -- Get customer name for notifications
    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Get deposit settings from proposal (proposal-level overrides template)
    v_require_deposit := COALESCE(NEW.require_deposit, true);
    v_deposit_amount := COALESCE(NEW.deposit_amount_due, 0);
    v_accepted_via_method := NEW.accepted_via_method;

    -- If no acceptance method specified, default to 'verbal' for manual approvals
    IF v_accepted_via_method IS NULL THEN
      v_accepted_via_method := 'verbal';
      NEW.accepted_via_method := 'verbal';
    END IF;

    -- Set approval timestamp if not set
    IF NEW.approval_completed_at IS NULL THEN
      NEW.approval_completed_at := now();
    END IF;

    -- ========================================================================
    -- Handle Different Approval Scenarios
    -- ========================================================================

    IF v_accepted_via_method = 'purchase_order' THEN
      -- ====== PURCHASE ORDER FLOW ======
      
      -- Check if PO number is provided
      IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
        -- PO number NOT provided - set pending flag
        NEW.po_pending := true;
        NEW.billing_action_type := 'purchase_order_pending';
        
        -- Don't create sales order yet - wait for PO number
        -- Notify sales rep that PO is needed
        BEGIN
          INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            related_id
          ) VALUES (
            COALESCE(NEW.assigned_to, NEW.created_by),
            'po_number_needed',
            'PO Number Needed',
            v_customer_name || ' approved proposal ' || NEW.proposal_number || ' with Purchase Order payment method, but did not provide a PO number. Please obtain the PO number to proceed.',
            NEW.id
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to create PO needed notification: %', SQLERRM;
        END;
        
        -- Exit early - don't create sales order yet
        RETURN NEW;
        
      ELSE
        -- PO number IS provided - proceed normally
        NEW.po_pending := false;
        v_sales_order_status := 'planning';
        NEW.billing_action_type := 'purchase_order';
        
        -- Generate sales order number
        v_order_number := generate_sales_order_number(NEW.proposal_number);
      END IF;

    ELSIF NOT v_require_deposit THEN
      -- ====== NO DEPOSIT REQUIRED FLOW ======
      v_sales_order_status := 'planning';
      NEW.billing_action_type := 'no_deposit_required';
      v_order_number := generate_sales_order_number(NEW.proposal_number);

    ELSIF NEW.deposit_paid THEN
      -- ====== DEPOSIT ALREADY PAID FLOW ======
      v_sales_order_status := 'planning';
      NEW.billing_action_type := 'deposit_invoice';
      v_order_number := generate_sales_order_number(NEW.proposal_number);

      -- Create paid invoice
      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();

        INSERT INTO invoices (
          company_id,
          proposal_id,
          contact_id,
          invoice_number,
          invoice_type,
          invoice_date,
          due_date,
          source_type,
          subtotal,
          tax_amount,
          tax_rate,
          total,
          amount_due,
          status,
          payment_terms,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          NEW.id,
          NEW.contact_id,
          v_invoice_number,
          'deposit',
          CURRENT_DATE,
          CURRENT_DATE,
          'deposit',
          v_deposit_amount,
          0,
          COALESCE(NEW.tax_rate, 0),
          v_deposit_amount,
          0,
          'paid',
          'Paid',
          'Deposit payment received for ' || v_customer_name,
          NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          amount,
          taxable
        ) VALUES (
          v_invoice_id,
          'Deposit for Proposal ' || NEW.proposal_number,
          1,
          v_deposit_amount,
          v_deposit_amount,
          false
        );

        INSERT INTO invoice_payments (
          company_id,
          invoice_id,
          proposal_id,
          payment_date,
          amount,
          payment_method,
          reference_number,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          v_invoice_id,
          NEW.id,
          COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
          v_deposit_amount,
          'other',
          'Deposit - Proposal ' || NEW.proposal_number,
          'Deposit payment recorded at approval',
          NEW.approved_by
        );

        NEW.deposit_invoice_id := v_invoice_id;
      END IF;

    ELSE
      -- ====== DEPOSIT REQUIRED BUT NOT PAID FLOW ======
      v_sales_order_status := 'pending_deposit';
      NEW.billing_action_type := 'deposit_invoice';
      NEW.deposit_request_sent := true;
      NEW.deposit_request_sent_at := now();
      v_order_number := generate_sales_order_number(NEW.proposal_number);

      -- Create deposit invoice
      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();

        INSERT INTO invoices (
          company_id,
          proposal_id,
          contact_id,
          invoice_number,
          invoice_type,
          invoice_date,
          due_date,
          source_type,
          subtotal,
          tax_amount,
          tax_rate,
          total,
          amount_due,
          status,
          payment_terms,
          notes,
          created_by
        ) VALUES (
          NEW.company_id,
          NEW.id,
          NEW.contact_id,
          v_invoice_number,
          'deposit',
          CURRENT_DATE,
          CURRENT_DATE,
          'deposit',
          v_deposit_amount,
          0,
          COALESCE(NEW.tax_rate, 0),
          v_deposit_amount,
          v_deposit_amount,
          'sent',
          'Due upon receipt',
          'Deposit invoice for ' || v_customer_name,
          NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          amount,
          taxable
        ) VALUES (
          v_invoice_id,
          'Deposit for Proposal ' || NEW.proposal_number,
          1,
          v_deposit_amount,
          v_deposit_amount,
          false
        );

        NEW.deposit_invoice_id := v_invoice_id;
      END IF;
    END IF;

    -- ========================================================================
    -- Create Sales Order (All scenarios except PO pending)
    -- ========================================================================

    IF v_order_number IS NOT NULL THEN
      INSERT INTO sales_orders (
        company_id,
        proposal_id,
        contact_id,
        order_number,
        status,
        contract_total,
        payment_terms,
        notes,
        created_by
      ) VALUES (
        NEW.company_id,
        NEW.id,
        NEW.contact_id,
        v_order_number,
        v_sales_order_status,
        NEW.total,
        COALESCE(NEW.payment_terms, 'Net 30'),
        CASE
          WHEN v_accepted_via_method = 'purchase_order' THEN
            'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number
          WHEN NEW.deposit_paid THEN
            'Converted from proposal ' || NEW.proposal_number || ' - Deposit received'
          WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
            'Converted from proposal ' || NEW.proposal_number || ' - Pending deposit payment'
          ELSE
            'Converted from proposal ' || NEW.proposal_number
        END,
        NEW.approved_by
      ) RETURNING id INTO v_sales_order_id;

      NEW.sales_order_id := v_sales_order_id;

      IF v_invoice_id IS NOT NULL THEN
        UPDATE invoices
        SET sales_order_id = v_sales_order_id
        WHERE id = v_invoice_id;
      END IF;

      NEW.billing_action_taken := true;
      NEW.billing_action_at := now();
      NEW.billing_action_by := NEW.approved_by;

      -- Notify sales rep (only if customer approved, not self-approval)
      IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
        BEGIN
          INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            related_id
          ) VALUES (
            COALESCE(NEW.assigned_to, NEW.created_by),
            'proposal_approved',
            'Customer Approved Proposal',
            v_customer_name || ' approved proposal ' || NEW.proposal_number || '. ' ||
            CASE
              WHEN v_accepted_via_method = 'purchase_order' THEN
                'Sales order created with PO #' || NEW.purchase_order_number || ' and is ready for scheduling.'
              WHEN NEW.deposit_paid THEN
                'Deposit received. Sales order created and ready for scheduling.'
              WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
                'Deposit invoice created and sent. Sales order pending deposit payment.'
              ELSE
                'Sales order created and ready for scheduling.'
            END,
            NEW.id
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to create notification: %', SQLERRM;
        END;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Create Function to Handle PO Number Entry (After Approval)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_po_pending_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_customer_name text;
BEGIN
  -- Only process when PO number is added to a po_pending proposal
  IF NEW.purchase_order_number IS NOT NULL 
     AND NEW.purchase_order_number != ''
     AND OLD.po_pending = true
     AND NEW.po_pending = true
     AND NEW.sales_order_id IS NULL
  THEN
    -- Clear po_pending flag
    NEW.po_pending := false;
    NEW.billing_action_type := 'purchase_order';

    -- Get customer name
    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    -- Generate sales order number
    v_order_number := generate_sales_order_number(NEW.proposal_number);

    -- Create sales order
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.contact_id,
      v_order_number,
      'planning',
      NEW.total,
      COALESCE(NEW.payment_terms, 'Net 30'),
      'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number,
      auth.uid()
    ) RETURNING id INTO v_sales_order_id;

    NEW.sales_order_id := v_sales_order_id;
    NEW.billing_action_taken := true;
    NEW.billing_action_at := now();
    NEW.billing_action_by := auth.uid();

    -- Notify sales rep that PO was received and order created
    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id
      ) VALUES (
        COALESCE(NEW.assigned_to, NEW.created_by),
        'proposal_approved',
        'PO Number Received',
        'PO #' || NEW.purchase_order_number || ' received for proposal ' || NEW.proposal_number || '. Sales order ' || v_order_number || ' created and ready for scheduling.',
        NEW.id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create PO received notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for PO completion
DROP TRIGGER IF EXISTS trigger_complete_po_pending_approval ON proposals;
CREATE TRIGGER trigger_complete_po_pending_approval
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION complete_po_pending_approval();

-- ============================================================================
-- 4. Create Trigger to Move Sales Order When Deposit is Paid
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_deposit_payment_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_sales_order_id uuid;
  v_proposal_number text;
  v_sales_rep_id uuid;
BEGIN
  -- Only process when deposit invoice status changes to 'paid'
  IF NEW.invoice_type = 'deposit'
     AND NEW.status = 'paid'
     AND OLD.status != 'paid'
     AND NEW.proposal_id IS NOT NULL
  THEN
    -- Get proposal and sales order info
    SELECT 
      p.id,
      p.sales_order_id,
      p.proposal_number,
      COALESCE(p.assigned_to, p.created_by)
    INTO 
      v_proposal_id,
      v_sales_order_id,
      v_proposal_number,
      v_sales_rep_id
    FROM proposals p
    WHERE p.id = NEW.proposal_id;

    -- Update proposal deposit_paid flag
    UPDATE proposals
    SET deposit_paid = true,
        deposit_payment_date = CURRENT_DATE
    WHERE id = v_proposal_id;

    -- Update sales order status from pending_deposit to planning
    IF v_sales_order_id IS NOT NULL THEN
      UPDATE sales_orders
      SET status = 'planning',
          notes = COALESCE(notes, '') || E'\nDeposit paid on ' || CURRENT_DATE::text
      WHERE id = v_sales_order_id
        AND status = 'pending_deposit';
    END IF;

    -- Notify sales rep that deposit was paid
    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id
      ) VALUES (
        v_sales_rep_id,
        'deposit_invoice_paid',
        'Deposit Payment Received',
        'Deposit payment received for proposal ' || v_proposal_number || '. Sales order moved to Planning and is ready for scheduling.',
        v_proposal_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create deposit paid notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for deposit payment
DROP TRIGGER IF EXISTS trigger_deposit_payment_completion ON invoices;
CREATE TRIGGER trigger_deposit_payment_completion
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_deposit_payment_completion();

-- ============================================================================
-- 5. Add New Notification Types
-- ============================================================================

-- Update notification type constraint to include new types
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'lead_assigned',
      'lead_status_changed',
      'task_assigned',
      'task_completed',
      'proposal_approved',
      'proposal_declined',
      'discussion_mention',
      'work_order_assigned',
      'work_order_status_changed',
      'home_clock_notification',
      'task_due_soon',
      'task_overdue',
      'product_request_submitted',
      'work_order_assignment',
      'po_number_needed',
      'deposit_invoice_paid',
      'proposal_reactivated',
      'proposal_message',
      'bug_report',
      'auto_clock_out',
      'vip_signup',
      'late_clock_in',
      'punchlist_service_request',
      'service_request_created',
      'system'
    ));
END $$;

-- ============================================================================
-- 6. Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION complete_po_pending_approval TO authenticated;
GRANT EXECUTE ON FUNCTION handle_deposit_payment_completion TO authenticated;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON COLUMN proposals.po_pending IS 
'True when proposal is approved with PO payment but PO number not yet provided';

COMMENT ON COLUMN proposals.po_document_url IS 
'Storage URL for uploaded PO document PDF (optional)';

COMMENT ON FUNCTION complete_po_pending_approval IS
'Completes PO pending approval when PO number is entered after initial approval';

COMMENT ON FUNCTION handle_deposit_payment_completion IS
'Automatically moves sales order from pending_deposit to planning when deposit invoice is paid';
