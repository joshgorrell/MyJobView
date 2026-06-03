/*
  # Update Approval Flow to Create Pending Sales Orders

  1. Changes
    - Allow proposals to be approved even without deposit
    - Create sales order immediately on approval
    - Sales order status reflects deposit status:
      - 'pending_deposit' - waiting for customer payment
      - 'planning' - deposit received, ready to schedule
    - Create invoice when deposit is paid (not at approval time)

  2. Business Logic
    - Customer clicks approve → always creates sales order
    - If deposit not paid → sales order status = 'pending_deposit'
    - When deposit paid later → sales order status changes to 'planning'
    - Sales rep can manually mark deposit received to move forward
*/

-- Update sales orders status constraint to include pending_deposit
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
  
  -- Add new constraint with pending_deposit status
  ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check 
    CHECK (status IN ('pending_deposit', 'planning', 'in_progress', 'on_hold', 'completed', 'cancelled'));
END $$;

-- Function to update sales order status when deposit is paid
CREATE OR REPLACE FUNCTION update_sales_order_on_deposit_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
BEGIN
  -- Check if deposit_paid changed from false to true
  IF NEW.deposit_paid = true AND (OLD.deposit_paid = false OR OLD.deposit_paid IS NULL) THEN
    -- Get the linked sales order
    SELECT sales_order_id INTO v_sales_order_id
    FROM proposals
    WHERE id = NEW.id;

    -- Update sales order status from pending_deposit to planning
    IF v_sales_order_id IS NOT NULL THEN
      UPDATE sales_orders
      SET 
        status = 'planning',
        updated_at = now()
      WHERE id = v_sales_order_id
        AND status = 'pending_deposit';
    END IF;

    -- Create deposit invoice if not already created
    IF NEW.deposit_invoice_id IS NULL AND NEW.deposit_amount_due > 0 THEN
      BEGIN
        NEW.deposit_invoice_id := create_deposit_invoice_from_proposal(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create deposit invoice: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for deposit payment
DROP TRIGGER IF EXISTS update_sales_order_on_deposit_payment_trigger ON proposals;
CREATE TRIGGER update_sales_order_on_deposit_payment_trigger
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  WHEN (NEW.deposit_paid IS DISTINCT FROM OLD.deposit_paid)
  EXECUTE FUNCTION update_sales_order_on_deposit_payment();

-- Update the main approval trigger to always create sales order
CREATE OR REPLACE FUNCTION create_sales_order_from_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_sales_order_status text;
  v_require_deposit boolean;
  v_acceptance_methods text[];
BEGIN
  -- Only process if status changed to 'approved' and no sales order exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.sales_order_id IS NULL THEN
    
    -- Get proposal-level acceptance requirements
    SELECT 
      COALESCE(NEW.require_deposit, ps.require_deposit, true),
      COALESCE(NEW.acceptance_methods, ps.acceptance_methods, ARRAY['payment']::text[])
    INTO v_require_deposit, v_acceptance_methods
    FROM proposal_settings ps
    WHERE ps.id = NEW.proposal_settings_id;

    -- Determine sales order status based on deposit requirements and payment status
    IF v_require_deposit AND NOT COALESCE(NEW.deposit_paid, false) THEN
      -- Deposit required but not paid yet
      v_sales_order_status := 'pending_deposit';
      
      -- Set deposit_request_sent flag if not already set
      IF NOT COALESCE(NEW.deposit_request_sent, false) THEN
        NEW.deposit_request_sent := true;
        NEW.deposit_request_sent_at := now();
      END IF;
    ELSE
      -- No deposit required, or deposit already paid
      v_sales_order_status := 'planning';
    END IF;

    -- Generate sales order number from proposal number
    v_order_number := generate_sales_order_number(NEW.proposal_number);

    -- Set approval timestamp if not already set
    IF NEW.approval_completed_at IS NULL THEN
      NEW.approval_completed_at := now();
    END IF;

    -- Create the sales order
    INSERT INTO sales_orders (
      company_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.contact_id,
      v_order_number,
      v_sales_order_status,
      NEW.total,
      NEW.payment_terms,
      CASE 
        WHEN v_sales_order_status = 'pending_deposit' THEN 
          'Converted from proposal ' || NEW.proposal_number || ' - Awaiting deposit payment'
        ELSE 
          'Converted from proposal ' || NEW.proposal_number
      END,
      NEW.approved_by,
      now(),
      now()
    )
    RETURNING id INTO v_sales_order_id;

    -- Link sales order back to proposal
    NEW.sales_order_id := v_sales_order_id;

    -- Create notification for sales rep (the proposal creator)
    IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO activity_feed (
        company_id,
        user_id,
        activity_type,
        entity_type,
        entity_id,
        title,
        description,
        created_at
      ) VALUES (
        NEW.company_id,
        NEW.created_by,
        'proposal_approved',
        'proposal',
        NEW.id,
        CASE 
          WHEN v_sales_order_status = 'pending_deposit' THEN 'Proposal Approved - Deposit Pending'
          ELSE 'Proposal Approved'
        END,
        'Proposal ' || NEW.proposal_number || ' has been approved and converted to Sales Order ' || v_order_number ||
        CASE 
          WHEN v_sales_order_status = 'pending_deposit' THEN ' (awaiting deposit payment)'
          ELSE ''
        END,
        now()
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_sales_order_on_deposit_payment() IS 'Updates sales order status from pending_deposit to planning when deposit is paid';
COMMENT ON COLUMN sales_orders.status IS 'Status: pending_deposit (awaiting payment), planning (ready to schedule), in_progress, on_hold, completed, cancelled';
