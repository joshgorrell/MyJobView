/*
  # Create Proposal Approval and Sales Order Conversion System

  1. Changes
    - Add approval tracking fields to proposals
    - Add approval_completed_at timestamp
    - Add approved_by field (can be customer or sales rep)
    - Create generate_sales_order_number() function matching proposal numbering (SO-##-#####)
    - Create trigger to auto-create sales order when proposal is approved
    - Create notification for sales rep when customer approves
    - Add deposit_paid and deposit_payment_date tracking

  2. Security
    - Maintain existing RLS policies
    - Ensure sales orders are created with proper permissions

  3. Business Logic
    - When proposal status changes to 'approved':
      * Check if acceptance requirements are met (deposit or PO if required)
      * Generate sales order with SO number from proposal number
      * Copy all proposal data to sales order
      * Notify sales rep of approval
      * Link sales order back to proposal
*/

-- Add approval tracking fields to proposals
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'approval_completed_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN approval_completed_at timestamptz;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE proposals ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'deposit_paid'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_paid boolean DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'deposit_payment_date'
  ) THEN
    ALTER TABLE proposals ADD COLUMN deposit_payment_date timestamptz;
  END IF;
END $$;

-- Add sales_order_id to proposals to track conversion
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'sales_order_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create function to generate sales order number from proposal number
CREATE OR REPLACE FUNCTION generate_sales_order_number(p_proposal_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Convert PRO-##-##### to SO-##-#####
  RETURN REPLACE(p_proposal_number, 'PRO-', 'SO-');
END;
$$;

-- Create function to check if proposal acceptance requirements are met
CREATE OR REPLACE FUNCTION check_proposal_acceptance_requirements(p_proposal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_require_deposit boolean;
  v_deposit_paid boolean;
  v_acceptance_methods text[];
  v_purchase_order_number text;
  v_accepted_via_method text;
BEGIN
  -- Get proposal details
  SELECT 
    COALESCE(ps.require_deposit, true),
    COALESCE(p.deposit_paid, false),
    COALESCE(ps.acceptance_methods, ARRAY['payment']::text[]),
    p.purchase_order_number,
    p.accepted_via_method
  INTO 
    v_require_deposit,
    v_deposit_paid,
    v_acceptance_methods,
    v_purchase_order_number,
    v_accepted_via_method
  FROM proposals p
  LEFT JOIN proposal_settings ps ON ps.id = p.proposal_settings_id
  WHERE p.id = p_proposal_id;

  -- If no deposit required, approval is valid
  IF NOT v_require_deposit THEN
    RETURN true;
  END IF;

  -- Check if accepted via payment and deposit is paid
  IF v_accepted_via_method = 'payment' AND 'payment' = ANY(v_acceptance_methods) THEN
    RETURN v_deposit_paid;
  END IF;

  -- Check if accepted via purchase order and PO is provided
  IF v_accepted_via_method = 'purchase_order' AND 'purchase_order' = ANY(v_acceptance_methods) THEN
    RETURN v_purchase_order_number IS NOT NULL;
  END IF;

  -- Requirements not met
  RETURN false;
END;
$$;

-- Create function to automatically create sales order from approved proposal
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
BEGIN
  -- Only process if status changed to 'approved' and no sales order exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.sales_order_id IS NULL THEN
    
    -- Check if acceptance requirements are met
    v_requirements_met := check_proposal_acceptance_requirements(NEW.id);
    
    IF NOT v_requirements_met THEN
      RAISE EXCEPTION 'Proposal acceptance requirements not met. Deposit or purchase order required.';
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

-- Create trigger for automatic sales order creation
DROP TRIGGER IF EXISTS trigger_create_sales_order_from_proposal ON proposals;

CREATE TRIGGER trigger_create_sales_order_from_proposal
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION create_sales_order_from_proposal();

-- Add index for sales order lookups
CREATE INDEX IF NOT EXISTS idx_proposals_sales_order_id ON proposals(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status_approved ON proposals(company_id, status) WHERE status = 'approved';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION generate_sales_order_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_proposal_acceptance_requirements(uuid) TO authenticated;