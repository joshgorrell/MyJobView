/*
  # Fix Automatic Invoice Creation to Include Tax Fields

  1. Changes
    - Update create_deposit_invoice_from_proposal function to include tax_environment and tax_project_type
    - These fields are copied from the proposal to ensure proper sales tax calculation

  2. Notes
    - Invoices automatically created from proposals now inherit the tax classification
    - This ensures all invoices have the required fields for the sales tax matrix
*/

-- Update function to create deposit invoice with tax fields
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
  -- Get proposal details including tax fields
  SELECT 
    p.id,
    p.company_id,
    p.contact_id,
    p.proposal_number,
    p.deposit_amount_due,
    p.created_by,
    p.tax_environment,
    p.tax_project_type,
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

  -- Create invoice with tax fields
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
    tax_environment,
    tax_project_type,
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
    COALESCE(v_proposal.tax_environment, 'residential'),
    COALESCE(v_proposal.tax_project_type, 'general_installation_repair'),
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
