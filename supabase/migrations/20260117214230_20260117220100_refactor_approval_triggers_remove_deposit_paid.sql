/*\n  # Refactor Approval Triggers to Remove deposit_paid Logic\n\n  1. Changes\n    - Update create_sales_order_from_proposal to remove deposit_paid checks\n    - All invoices created with status 'sent' (never 'paid')\n    - Sales order status based on acceptance method:\n      - 'purchase_order' → 'planning' (no deposit needed)\n      - 'payment' or 'verbal' → 'pending_deposit' (awaiting payment)\n    - Track acceptance_method_used in proposals table\n    - Remove deposit_paid from all trigger logic\n\n  2. Business Logic Flow\n    - Customer approves with PO → Sales Order status = 'planning' (no invoice)\n    - Customer approves with payment → Invoice created as 'sent', Sales Order status = 'pending_deposit'\n    - Sales rep approves verbally → Invoice created as 'sent', Sales Order status = 'pending_deposit'\n    - When invoice is paid → Separate trigger updates Sales Order to 'planning'\n*/\n\n-- Update create_deposit_invoice_from_proposal to always create invoices as 'sent'\nCREATE OR REPLACE FUNCTION create_deposit_invoice_from_proposal(p_proposal_id uuid)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nDECLARE\n  v_invoice_id uuid

\n  v_invoice_number text

\n  v_proposal record

\n  v_deposit_amount numeric(10,2)

\n  v_deposit_description text

\nBEGIN\n  -- Get proposal details\n  SELECT \n    p.id,\n    p.company_id,\n    p.contact_id,\n    p.proposal_number,\n    p.deposit_amount_due,\n    p.created_by,\n    c.full_name as contact_name\n  INTO v_proposal\n  FROM proposals p\n  LEFT JOIN contacts c ON c.id = p.contact_id\n  WHERE p.id = p_proposal_id

\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Proposal not found'

\n  END IF

\n\n  v_deposit_amount := COALESCE(v_proposal.deposit_amount_due, 0)

\n  \n  IF v_deposit_amount <= 0 THEN\n    RAISE EXCEPTION 'No deposit amount to invoice'

\n  END IF

\n\n  -- Generate invoice number\n  v_invoice_number := generate_invoice_number()

\n  \n  -- Create description\n  v_deposit_description := 'Deposit for Proposal ' || v_proposal.proposal_number

\n\n  -- Create invoice - ALWAYS with status 'sent' (customer needs to pay)\n  INSERT INTO invoices (\n    company_id,\n    proposal_id,\n    contact_id,\n    invoice_number,\n    invoice_type,\n    invoice_date,\n    due_date,\n    subtotal,\n    tax_amount,\n    total,\n    amount_due,\n    status,\n    payment_terms,\n    notes,\n    created_by,\n    created_at,\n    updated_at\n  ) VALUES (\n    v_proposal.company_id,\n    v_proposal.id,\n    v_proposal.contact_id,\n    v_invoice_number,\n    'deposit',\n    CURRENT_DATE,\n    CURRENT_DATE,\n    v_deposit_amount,\n    0,\n    v_deposit_amount,\n    v_deposit_amount,\n    'sent', -- Always sent, never paid\n    'Due upon receipt',\n    'Deposit invoice for ' || v_proposal.contact_name,\n    v_proposal.created_by,\n    now(),\n    now()\n  )\n  RETURNING id INTO v_invoice_id

\n\n  -- Add line item\n  INSERT INTO invoice_line_items (\n    invoice_id,\n    description,\n    quantity,\n    unit_price,\n    amount,\n    sort_order\n  ) VALUES (\n    v_invoice_id,\n    v_deposit_description,\n    1,\n    v_deposit_amount,\n    v_deposit_amount,\n    1\n  )

\n\n  -- Update proposal with invoice reference\n  UPDATE proposals\n  SET deposit_invoice_id = v_invoice_id\n  WHERE id = p_proposal_id

\n\n  RETURN v_invoice_id

\nEND

\n$$

\n\n-- Refactor the main approval trigger to remove deposit_paid logic\nCREATE OR REPLACE FUNCTION create_sales_order_from_proposal()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nDECLARE\n  v_sales_order_id uuid

\n  v_order_number text

\n  v_sales_order_status text

\n  v_require_deposit boolean

\n  v_invoice_id uuid

\n  v_notification_title text

\n  v_notification_desc text

\nBEGIN\n  -- Only process if status changed to 'approved' and no sales order exists yet\n  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.sales_order_id IS NULL THEN\n    \n    -- Get deposit requirement from proposal settings\n    SELECT COALESCE(ps.require_deposit, true)\n    INTO v_require_deposit\n    FROM proposal_settings ps\n    WHERE ps.proposal_id = NEW.id

\n\n    -- Determine sales order status based on acceptance method\n    IF NEW.acceptance_method_used = 'purchase_order' THEN\n      -- Purchase orders bypass deposit requirement\n      v_sales_order_status := 'planning'

\n      v_notification_title := 'Proposal Approved - Purchase Order'

\n      v_notification_desc := 'Proposal ' || NEW.proposal_number || ' approved with Purchase Order. Sales Order ' || generate_sales_order_number(NEW.proposal_number) || ' is ready for planning.'

\n      \n    ELSIF v_require_deposit THEN\n      -- Payment or verbal approval requires deposit\n      v_sales_order_status := 'pending_deposit'

\n      v_notification_title := 'Proposal Approved - Deposit Pending'

\n      v_notification_desc := 'Proposal ' || NEW.proposal_number || ' approved. Awaiting deposit payment before work can begin.'

\n      \n      -- Create deposit invoice with status 'sent'\n      IF NEW.deposit_invoice_id IS NULL AND NEW.deposit_amount_due > 0 THEN\n        BEGIN\n          v_invoice_id := create_deposit_invoice_from_proposal(NEW.id)

\n          NEW.deposit_invoice_id := v_invoice_id

\n        EXCEPTION WHEN OTHERS THEN\n          RAISE WARNING 'Failed to create deposit invoice: %', SQLERRM

\n        END

\n      END IF

\n      \n    ELSE\n      -- No deposit required\n      v_sales_order_status := 'planning'

\n      v_notification_title := 'Proposal Approved'

\n      v_notification_desc := 'Proposal ' || NEW.proposal_number || ' approved. Sales Order is ready for planning.'

\n    END IF

\n\n    -- Generate sales order number from proposal number\n    v_order_number := generate_sales_order_number(NEW.proposal_number)

\n\n    -- Set approval timestamp if not already set\n    IF NEW.approval_completed_at IS NULL THEN\n      NEW.approval_completed_at := now()

\n    END IF

\n\n    -- Create the sales order\n    INSERT INTO sales_orders (\n      company_id,\n      proposal_id,\n      contact_id,\n      order_number,\n      status,\n      contract_total,\n      payment_terms,\n      notes,\n      created_by,\n      created_at,\n      updated_at\n    ) VALUES (\n      NEW.company_id,\n      NEW.id,\n      NEW.contact_id,\n      v_order_number,\n      v_sales_order_status,\n      NEW.total,\n      NEW.payment_terms,\n      CASE \n        WHEN v_sales_order_status = 'pending_deposit' THEN \n          'Converted from proposal ' || NEW.proposal_number || ' - Awaiting deposit payment'\n        ELSE \n          'Converted from proposal ' || NEW.proposal_number\n      END,\n      NEW.approved_by,\n      now(),\n      now()\n    )\n    RETURNING id INTO v_sales_order_id

\n\n    -- Link sales order back to proposal\n    NEW.sales_order_id := v_sales_order_id

\n\n    -- Create notification for sales rep (if approved by someone else)\n    IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN\n      INSERT INTO activity_feed (\n        company_id,\n        user_id,\n        activity_type,\n        entity_type,\n        entity_id,\n        title,\n        description,\n        created_at\n      ) VALUES (\n        NEW.company_id,\n        NEW.created_by,\n        'proposal_approved',\n        'proposal',\n        NEW.id,\n        v_notification_title,\n        v_notification_desc,\n        now()\n      )

\n    END IF

\n\n  END IF

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Remove the old deposit payment trigger (no longer needed)\nDROP TRIGGER IF EXISTS update_sales_order_on_deposit_payment_trigger ON proposals

\nDROP FUNCTION IF EXISTS update_sales_order_on_deposit_payment()

\n\nCOMMENT ON FUNCTION create_deposit_invoice_from_proposal(uuid) IS 'Creates deposit invoice with status sent (never paid). Customer must pay the invoice.'

\nCOMMENT ON FUNCTION create_sales_order_from_proposal() IS 'Creates sales order on approval. Status based on acceptance method: PO=planning, payment/verbal=pending_deposit'

\n
