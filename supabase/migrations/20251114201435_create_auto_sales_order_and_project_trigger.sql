/*
  # Auto-Create Sales Order and Project on Proposal Approval

  1. New Function
    - `create_sales_order_and_project_from_proposal`
    - Triggered when proposal status changes to 'approved'
    - Creates a sales order with auto-incrementing order number
    - Creates a project linked to the sales order
    - Returns the created records

  2. Trigger
    - Fires after proposal update
    - Only when status changes to 'approved'
    - Auto-generates order numbers and project numbers
*/

-- Function to generate next order number for company
CREATE OR REPLACE FUNCTION get_next_order_number()
RETURNS text AS $$
DECLARE
  v_next_num integer;
  v_order_number text;
BEGIN
  -- Get the highest existing order number (assumes format: SO-YYYY-NNNN)
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS integer)), 0) + 1
  INTO v_next_num
  FROM sales_orders
  WHERE order_number ~ '^SO-\d{4}-\d+$';

  -- Generate new order number with current year
  v_order_number := 'SO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_next_num::text, 4, '0');
  
  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next project number
CREATE OR REPLACE FUNCTION get_next_project_number()
RETURNS text AS $$
DECLARE
  v_next_num integer;
  v_project_number text;
BEGIN
  -- Get the highest existing project number (assumes format: PRJ-YYYY-NNNN)
  SELECT COALESCE(MAX(CAST(SUBSTRING(project_number FROM '\d+$') AS integer)), 0) + 1
  INTO v_next_num
  FROM projects
  WHERE project_number ~ '^PRJ-\d{4}-\d+$';

  -- Generate new project number with current year
  v_project_number := 'PRJ-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_next_num::text, 4, '0');
  
  RETURN v_project_number;
END;
$$ LANGUAGE plpgsql;

-- Main trigger function
CREATE OR REPLACE FUNCTION create_sales_order_and_project_from_proposal()
RETURNS TRIGGER AS $$
DECLARE
  v_sales_order_id uuid;
  v_project_id uuid;
  v_order_number text;
  v_project_number text;
  v_company_id uuid;
BEGIN
  -- Only proceed if status changed to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Get company_id from the user who created the proposal
    SELECT id INTO v_company_id
    FROM profiles
    WHERE id = NEW.created_by;

    -- Check if sales order already exists for this proposal
    SELECT id INTO v_sales_order_id
    FROM sales_orders
    WHERE proposal_id = NEW.id;

    -- Only create if doesn't exist
    IF v_sales_order_id IS NULL THEN
      -- Generate order number
      v_order_number := get_next_order_number();

      -- Create Sales Order
      INSERT INTO sales_orders (
        company_id,
        proposal_id,
        contact_id,
        order_number,
        status,
        contract_total,
        payment_terms,
        notes,
        created_by
      )
      VALUES (
        v_company_id,
        NEW.id,
        NEW.contact_id,
        v_order_number,
        'planning',
        NEW.total,
        'Standard Terms',
        'Auto-created from approved proposal: ' || NEW.title,
        NEW.created_by
      )
      RETURNING id INTO v_sales_order_id;

      -- Generate project number
      v_project_number := get_next_project_number();

      -- Create Project
      INSERT INTO projects (
        company_id,
        sales_order_id,
        contact_id,
        project_number,
        name,
        status,
        assigned_pm,
        notes,
        created_by
      )
      VALUES (
        v_company_id,
        v_sales_order_id,
        NEW.contact_id,
        v_project_number,
        NEW.title,
        'planning',
        NEW.created_by, -- Default to proposal creator as PM
        'Auto-created from proposal: ' || NEW.proposal_number,
        NEW.created_by
      )
      RETURNING id INTO v_project_id;

      -- Log the creation
      RAISE NOTICE 'Created Sales Order % and Project % for Proposal %', 
        v_order_number, v_project_number, NEW.proposal_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_create_sales_order_and_project ON proposals;
CREATE TRIGGER trigger_create_sales_order_and_project
  AFTER UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION create_sales_order_and_project_from_proposal();
