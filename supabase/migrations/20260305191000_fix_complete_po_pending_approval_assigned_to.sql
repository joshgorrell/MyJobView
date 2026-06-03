/*
  # Fix complete_po_pending_approval trigger - remove invalid NEW.assigned_to reference

  ## Problem
  The `complete_po_pending_approval` trigger function references `NEW.assigned_to`
  which does not exist on the `proposals` table. This causes a silent failure in the
  notification INSERT (caught by WHEN OTHERS THEN RAISE WARNING), meaning PO received
  notifications are never sent.

  ## Fix
  Replace `COALESCE(NEW.assigned_to, NEW.created_by)` with just `NEW.created_by`,
  matching the same fix applied to `handle_unified_proposal_approval`.

  ## Also fixes
  The sales_orders INSERT uses `company_id` but the proposals table uses `organization_id`.
  Updated to use `organization_id` consistently.
*/

CREATE OR REPLACE FUNCTION complete_po_pending_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id uuid;
  v_order_number text;
  v_customer_name text;
BEGIN
  IF NEW.purchase_order_number IS NOT NULL
  AND NEW.purchase_order_number != ''
  AND OLD.po_pending = true
  AND NEW.po_pending = true
  AND NEW.sales_order_id IS NULL
  THEN
    NEW.po_pending := false;
    NEW.billing_action_type := 'purchase_order';

    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;

    v_order_number := generate_sales_order_number(NEW.proposal_number);

    INSERT INTO sales_orders (
      organization_id,
      proposal_id,
      contact_id,
      order_number,
      status,
      contract_total,
      payment_terms,
      notes,
      created_by
    ) VALUES (
      NEW.organization_id,
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

    BEGIN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id
      ) VALUES (
        NEW.created_by,
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
