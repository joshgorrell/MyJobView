/*
  # Add Invoice Paid Deposit Trigger

  1. Function
    - Creates trigger function to update proposal deposit_paid status
    - Runs when invoice status changes to 'paid'
    - Checks if invoice is linked to a proposal as deposit invoice
    - Updates proposal.deposit_paid and sales_order status

  2. Trigger
    - Fires after UPDATE on invoices table
    - Only when status changes to 'paid'
    - Automatically updates proposal and sales order when deposit is fully paid
*/

-- Create function to handle invoice paid status for deposits
CREATE OR REPLACE FUNCTION handle_invoice_paid_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid;
  v_sales_order_id uuid;
BEGIN
  -- Only proceed if status changed to paid and it wasn't paid before
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Check if this invoice is a deposit invoice for a proposal
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE deposit_invoice_id = NEW.id
    AND deposit_paid = false
    LIMIT 1;

    IF v_proposal_id IS NOT NULL THEN
      -- Update proposal deposit status
      UPDATE proposals
      SET 
        deposit_paid = true,
        deposit_payment_date = now()
      WHERE id = v_proposal_id;

      -- Update sales order status from pending_deposit to planning
      SELECT id INTO v_sales_order_id
      FROM sales_orders
      WHERE proposal_id = v_proposal_id
      AND status = 'pending_deposit';

      IF v_sales_order_id IS NOT NULL THEN
        UPDATE sales_orders
        SET status = 'planning'
        WHERE id = v_sales_order_id;
      END IF;

      -- Update project status to approved (from pending_deposit)
      UPDATE projects
      SET status = 'approved'
      WHERE sales_order_id = v_sales_order_id
      AND status = 'pending_deposit';

      -- Create notification for proposal creator
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id
      )
      SELECT 
        p.created_by,
        'deposit_paid',
        'Deposit Payment Received',
        'Deposit payment received for proposal #' || p.proposal_number || '. Project is now approved and ready for production.',
        p.id
      FROM proposals p
      WHERE p.id = v_proposal_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_invoice_paid_deposit ON invoices;
CREATE TRIGGER trigger_invoice_paid_deposit
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid'))
  EXECUTE FUNCTION handle_invoice_paid_deposit();
