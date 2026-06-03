/*
  # Add Proposal-Level Acceptance Methods and Automatic Invoice Creation

  1. Changes
    - Add `acceptance_methods` to proposals table (overrides template setting)
    - Add `require_deposit` to proposals table (overrides template setting)
    - Add `proposal_id` to invoices table for linking
    - Create function to automatically generate deposit invoice
    - Update approval trigger to create invoice on payment

  2. Security
    - Maintain existing RLS policies
    - Sales reps can see invoices for their proposals

  3. Business Logic
    - Sales reps set acceptance methods per proposal
    - When deposit is paid, invoice is automatically created
    - Invoice is linked to both proposal and contact
    - Invoice syncs to QuickBooks Online
    - Sales reps can view all related invoices for their customers
*/

-- Add proposal-level acceptance settings to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS acceptance_methods text[] DEFAULT ARRAY['payment']::text[];
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS require_deposit boolean DEFAULT true;

-- Add proposal reference to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL;

-- Create index for proposal invoices
CREATE INDEX IF NOT EXISTS idx_invoices_proposal ON invoices(proposal_id);

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next_num integer;
  v_invoice_number text;
BEGIN
  -- Get next invoice number (simple sequential)
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO v_next_num
  FROM invoices;
  
  -- Format as INV-##### (5 digits, zero padded)
  v_invoice_number := 'INV-' || LPAD(v_next_num::text, 5, '0');
  
  RETURN v_invoice_number;
END;
$$;

-- Function to create deposit invoice from proposal
CREATE OR REPLACE FUNCTION create_deposit_invoice_from_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_proposal record;
  v_deposit_amount numeric(10,2);
  v_deposit_description text;
BEGIN
  -- Get proposal details
  SELECT 
    p.id,
    p.company_id,
    p.contact_id,
    p.proposal_number,
    p.deposit_amount_due,
    p.created_by,
    c.full_name as contact_name
  INTO v_proposal
  FROM proposals p
  LEFT JOIN contacts c ON c.id = p.contact_id
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  v_deposit_amount := COALESCE(v_proposal.deposit_amount_due, 0);
  
  IF v_deposit_amount <= 0 THEN
    RAISE EXCEPTION 'No deposit amount to invoice';
  END IF;

  -- Generate invoice number
  v_invoice_number := generate_invoice_number();
  
  -- Create description
  v_deposit_description := 'Deposit for Proposal ' || v_proposal.proposal_number;

  -- Create invoice
  INSERT INTO invoices (
    company_id,
    proposal_id,
    contact_id,
    invoice_number,
    invoice_type,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total,
    amount_due,
    status,
    payment_terms,
    notes,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_proposal.company_id,
    v_proposal.id,
    v_proposal.contact_id,
    v_invoice_number,
    'deposit',
    CURRENT_DATE,
    CURRENT_DATE,
    v_deposit_amount,
    0,
    v_deposit_amount,
    v_deposit_amount,
    'sent',
    'Due upon receipt',
    'Deposit invoice for ' || v_proposal.contact_name,
    v_proposal.created_by,
    now(),
    now()
  )
  RETURNING id INTO v_invoice_id;

  -- Add line item
  INSERT INTO invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    amount,
    sort_order
  ) VALUES (
    v_invoice_id,
    v_deposit_description,
    1,
    v_deposit_amount,
    v_deposit_amount,
    1
  );

  -- Update proposal with invoice reference
  UPDATE proposals
  SET deposit_invoice_id = v_invoice_id
  WHERE id = p_proposal_id;

  RETURN v_invoice_id;
END;
$$;

-- Update the proposal approval trigger to create invoice on deposit payment
CREATE OR REPLACE FUNCTION create_sales_order_from_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_requirements_met boolean;
  v_notification_id uuid;
  v_invoice_id uuid;
BEGIN
  -- Only process if status changed to 'approved' and no sales order exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.sales_order_id IS NULL THEN
    
    -- Check if acceptance requirements are met
    v_requirements_met := check_proposal_acceptance_requirements(NEW.id);
    
    IF NOT v_requirements_met THEN
      RAISE EXCEPTION 'Proposal acceptance requirements not met. Deposit or purchase order required.';
    END IF;

    -- Create deposit invoice if deposit was paid and no invoice exists
    IF NEW.deposit_paid = true AND NEW.deposit_invoice_id IS NULL AND NEW.deposit_amount_due > 0 THEN
      BEGIN
        v_invoice_id := create_deposit_invoice_from_proposal(NEW.id);
        NEW.deposit_invoice_id := v_invoice_id;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't block approval
        RAISE WARNING 'Failed to create deposit invoice: %', SQLERRM;
      END;
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
      'planning',
      NEW.total,
      NEW.payment_terms,
      'Converted from proposal ' || NEW.proposal_number,
      NEW.approved_by,
      now(),
      now()
    )
    RETURNING id INTO v_sales_order_id;

    -- Link sales order back to proposal
    NEW.sales_order_id := v_sales_order_id;

    -- Create notification for sales rep (the proposal creator)
    -- Only if approved by someone other than the creator (i.e., customer approval)
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
        'Proposal Approved by Customer',
        'Proposal ' || NEW.proposal_number || ' has been approved and converted to Sales Order ' || v_order_number,
        now()
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION create_deposit_invoice_from_proposal(uuid) TO authenticated;

-- Add policy for sales reps to view invoices for their proposals
DROP POLICY IF EXISTS "Sales reps can view invoices for their proposals" ON invoices;
CREATE POLICY "Sales reps can view invoices for their proposals"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT id FROM proposals WHERE created_by = auth.uid()
    )
  );

-- Add comments
COMMENT ON COLUMN proposals.acceptance_methods IS 'Acceptance methods allowed for this specific proposal (overrides template)';
COMMENT ON COLUMN proposals.require_deposit IS 'Whether deposit is required for this specific proposal (overrides template)';
COMMENT ON COLUMN invoices.proposal_id IS 'Link to the proposal this invoice was generated from';
COMMENT ON FUNCTION create_deposit_invoice_from_proposal(uuid) IS 'Automatically creates a deposit invoice when proposal is approved with payment';
