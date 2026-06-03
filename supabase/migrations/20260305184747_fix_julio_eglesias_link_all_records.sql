
/*
  # Fix Stuck Proposal for Julio Eglesias (PRO-01-25000)

  The approval trigger partially ran — the project PRJ-01-25000 was created
  but the sales order and deposit invoice were never created.
  This migration creates the sales order and invoice, then links everything.
*/

DO $$
DECLARE
  v_proposal_id     uuid := '16089a2a-7b67-48c4-a590-2f2d68c2f928';
  v_company_id      uuid := 'b1118e5f-86ea-49af-8255-dc2a33bd126e';
  v_org_id          uuid := 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
  v_contact_id      uuid := 'ca5dc5ea-e032-490f-a817-a44e14c707d1';
  v_approved_by     uuid := 'b7a3a863-b230-4c54-a8d6-39b123a2924a';
  v_project_id      uuid := 'b2d727dc-855f-4be5-a3a9-e8fb2ce38404';
  v_total           numeric := 22199.21;
  v_deposit_amount  numeric := 15233.58;
  v_tax_rate        numeric := 0.0935;

  v_so_id           uuid;
  v_invoice_id      uuid;
  v_inv_num         text;
BEGIN

  -- Only proceed if proposal still has no sales_order_id
  IF EXISTS (SELECT 1 FROM proposals WHERE id = v_proposal_id AND sales_order_id IS NULL) THEN

    -- 1. Create the sales order
    INSERT INTO sales_orders (
      company_id, organization_id,
      proposal_id, contact_id,
      order_number, status,
      contract_total, payment_terms, notes, created_by,
      project_id
    ) VALUES (
      v_company_id, v_org_id,
      v_proposal_id, v_contact_id,
      'SO-01-25000', 'pending_deposit',
      v_total, 'Net 10',
      'Converted from proposal PRO-01-25000 - Pending deposit payment',
      v_approved_by,
      v_project_id
    ) RETURNING id INTO v_so_id;

    -- 2. Create deposit invoice
    v_inv_num := generate_invoice_number();

    INSERT INTO invoices (
      company_id, organization_id,
      proposal_id, contact_id,
      invoice_number, invoice_type,
      invoice_date, due_date, source_type,
      subtotal, tax_amount, tax_rate,
      tax_environment, tax_project_type,
      total, amount_due, status, payment_terms, notes,
      created_by, sales_order_id
    ) VALUES (
      v_company_id, v_org_id,
      v_proposal_id, v_contact_id,
      v_inv_num, 'deposit',
      CURRENT_DATE, CURRENT_DATE, 'deposit',
      v_deposit_amount, 0, v_tax_rate,
      'residential', 'general_installation_repair',
      v_deposit_amount, v_deposit_amount, 'sent', 'Due upon receipt',
      'Deposit invoice for Julio Eglesias',
      v_approved_by, v_so_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO invoice_line_items (
      invoice_id, organization_id,
      description, quantity, unit_price, amount, is_taxable
    ) VALUES (
      v_invoice_id, v_org_id,
      'Deposit for Proposal PRO-01-25000',
      1, v_deposit_amount, v_deposit_amount, false
    );

    -- 3. Link project to sales order
    UPDATE projects SET sales_order_id = v_so_id WHERE id = v_project_id;

    -- 4. Link everything back to the proposal
    UPDATE proposals
    SET
      sales_order_id     = v_so_id,
      deposit_invoice_id = v_invoice_id
    WHERE id = v_proposal_id;

    RAISE NOTICE 'Fixed: SO=%, Invoice=%, Project=%', v_so_id, v_invoice_id, v_project_id;
  ELSE
    RAISE NOTICE 'Proposal already has a sales order — skipping.';
  END IF;

END $$;
