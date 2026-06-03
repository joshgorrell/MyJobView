/*
  # Add Deposit Payment Trigger

  1. Function
    - Creates trigger function to update proposal deposit_paid status
    - Runs when payment is recorded on an invoice
    - Checks if invoice is fully paid and linked to a proposal
    - Updates proposal.deposit_paid and sales_order status

  2. Trigger
    - Fires after INSERT on payments table
    - Automatically updates proposal and sales order when deposit is paid
    - Sends notification to sales rep

  3. Process Flow
    - Payment recorded → Invoice updated → Check if fully paid
    - If invoice is deposit invoice → Update proposal.deposit_paid = true
    - Update sales_order status from pending_deposit to planning
    - Notify sales rep that deposit has been received
*/

-- Create function to handle deposit payment completion
CREATE OR REPLACE FUNCTION handle_deposit_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_proposal_id uuid;
  v_sales_order_id uuid;
BEGIN
  -- Get the invoice details
  SELECT id, amount_due, status
  INTO v_invoice
  FROM invoices
  WHERE id = NEW.invoice_id;

  -- Only proceed if invoice is now fully paid
  IF v_invoice.amount_due <= 0 AND v_invoice.status = 'paid' THEN
    -- Check if this invoice is a deposit invoice for a proposal
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE deposit_invoice_id = NEW.invoice_id
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
        'Deposit payment received for proposal #' || p.proposal_number,
        p.id
      FROM proposals p
      WHERE p.id = v_proposal_id;

      -- Log activity
      INSERT INTO activity_feed (
        type,
        title,
        description,
        related_id,
        metadata
      )
      SELECT
        'deposit_payment_received',
        'Deposit Payment Received',
        'Deposit payment received for proposal #' || p.proposal_number,
        p.id,
        jsonb_build_object(
          'proposal_id', p.id,
          'invoice_id', NEW.invoice_id,
          'payment_id', NEW.id,
          'amount', NEW.amount
        )
      FROM proposals p
      WHERE p.id = v_proposal_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_deposit_payment ON payments;
CREATE TRIGGER trigger_deposit_payment
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION handle_deposit_payment();
