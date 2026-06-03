/*
  # Fix Proposal Approval Trigger - Use proposal_id

  1. Issue
    - Trigger tries to lookup proposal_settings by company_id
    - proposal_settings table doesn't have company_id column
    - proposal_settings is per-proposal, not company-wide

  2. Fix
    - Lookup proposal_settings by proposal_id (NEW.id)
    - This correctly gets the settings for the specific proposal being approved
*/

-- Fix the approval trigger to lookup settings by proposal_id
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
    
    -- Get proposal-level acceptance requirements from proposal settings
    SELECT 
      COALESCE(NEW.require_deposit, ps.require_deposit, true),
      COALESCE(NEW.acceptance_methods, ps.acceptance_methods, ARRAY['payment']::text[])
    INTO v_require_deposit, v_acceptance_methods
    FROM proposal_settings ps
    WHERE ps.proposal_id = NEW.id
    LIMIT 1;

    -- If no proposal_settings found, use values from proposal or defaults
    IF v_require_deposit IS NULL THEN
      v_require_deposit := COALESCE(NEW.require_deposit, true);
      v_acceptance_methods := COALESCE(NEW.acceptance_methods, ARRAY['payment']::text[]);
    END IF;

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
      'Net 30',
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

COMMENT ON FUNCTION create_sales_order_from_proposal() IS 'Creates sales order when proposal is approved, looking up settings by proposal_id';
