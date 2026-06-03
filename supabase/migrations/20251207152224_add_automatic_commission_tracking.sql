/*
  # Add Automatic Commission Tracking

  ## Summary
  Automates commission record creation and updates when invoices are created and payments are received.
  Commissions accrue proportionally based on payment collection.

  ## Changes Made

  ### 1. New Triggers
  - **create_commission_records_for_invoice** - Automatically creates commission records when an invoice is created for a project
  - **update_commission_on_payment** - Updates commission earnings when payments are received

  ### 2. Commission Creation Logic
  When an invoice is created for a project:
  - Creates commission record for **Sales Rep** (from sales_order.created_by)
  - Creates commission record for **Project Manager** (from project.assigned_pm)
  - Uses company default rates or employee custom rates
  - Uses commission basis (gross/profit) from company settings
  - Initial status: **pending** (no payments yet)

  ### 3. Payment-Based Accrual
  When a payment is recorded:
  - Calculates percentage collected (amount_paid / invoice.total)
  - Updates amount_earned = total_potential_commission × percentage_collected
  - Updates status:
    - **pending** - No payments received (amount_paid = 0)
    - **accruing** - Partial payments received (0 < amount_paid < total)
    - **ready_to_pay** - Fully paid (amount_paid >= total)

  ### 4. Rate Resolution Order
  1. Employee custom rate (if set)
  2. Company default rate (fallback)

  ## Important Notes
  - Designer commissions are NOT automatically created (design_credit_mode can be auto/manual)
  - Service Sales and Service PM commissions are NOT created for project invoices
  - Admins can manually create commission records for designers or adjust rates
  - Basis amount is invoice.total (or invoice.subtotal for profit basis if cost tracking added)
  - Commission records link to both project_id and invoice_id for tracking
*/

-- Function to get effective commission rate for an employee and role type
CREATE OR REPLACE FUNCTION get_effective_commission_rate(
  p_employee_id uuid,
  p_role_type text
)
RETURNS numeric AS $$
DECLARE
  v_custom_rate numeric;
  v_default_rate numeric;
  v_settings record;
BEGIN
  -- Get company settings
  SELECT * INTO v_settings FROM company_commission_settings LIMIT 1;
  
  -- Get employee custom rate if exists
  SELECT 
    CASE p_role_type
      WHEN 'sales_projects' THEN custom_sales_projects_rate
      WHEN 'design' THEN custom_design_rate
      WHEN 'pm' THEN custom_pm_rate
      WHEN 'service_sales' THEN custom_service_sales_rate
      WHEN 'service_pm' THEN custom_service_pm_rate
    END INTO v_custom_rate
  FROM employee_commission_config
  WHERE employee_id = p_employee_id
    AND eligible_for_commissions = true;
  
  -- Return custom rate if set, otherwise return default
  IF v_custom_rate IS NOT NULL THEN
    RETURN v_custom_rate;
  END IF;
  
  -- Return default rate
  RETURN CASE p_role_type
    WHEN 'sales_projects' THEN v_settings.default_sales_projects_rate
    WHEN 'design' THEN v_settings.default_design_rate
    WHEN 'pm' THEN v_settings.default_pm_rate
    WHEN 'service_sales' THEN v_settings.default_service_sales_rate
    WHEN 'service_pm' THEN v_settings.default_service_pm_rate
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create commission records when invoice is created
CREATE OR REPLACE FUNCTION create_commission_records_for_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_project record;
  v_sales_order record;
  v_settings record;
  v_sales_rep_id uuid;
  v_pm_id uuid;
  v_sales_rate numeric;
  v_pm_rate numeric;
  v_basis_amount numeric;
  v_basis_type text;
BEGIN
  -- Only process if invoice has a project_id
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get project details
  SELECT * INTO v_project FROM projects WHERE id = NEW.project_id;
  
  -- Get sales order to find sales rep
  IF v_project.sales_order_id IS NOT NULL THEN
    SELECT * INTO v_sales_order FROM sales_orders WHERE id = v_project.sales_order_id;
    v_sales_rep_id := v_sales_order.created_by;
  END IF;
  
  -- Get project manager
  v_pm_id := v_project.assigned_pm;
  
  -- Get company settings for basis type
  SELECT * INTO v_settings FROM company_commission_settings LIMIT 1;
  v_basis_type := v_settings.commission_basis;
  
  -- Use invoice total as basis (in future, could use subtotal for profit basis)
  v_basis_amount := NEW.total;
  
  -- Create Sales Rep Commission Record
  IF v_sales_rep_id IS NOT NULL THEN
    -- Check if employee is eligible
    IF EXISTS (
      SELECT 1 FROM employee_commission_config 
      WHERE employee_id = v_sales_rep_id 
        AND eligible_for_commissions = true
    ) OR NOT EXISTS (
      SELECT 1 FROM employee_commission_config 
      WHERE employee_id = v_sales_rep_id
    ) THEN
      v_sales_rate := get_effective_commission_rate(v_sales_rep_id, 'sales_projects');
      
      INSERT INTO commission_records (
        employee_id,
        project_id,
        invoice_id,
        role_type,
        basis_type,
        basis_amount,
        commission_rate,
        total_potential_commission,
        amount_collected,
        amount_earned,
        amount_paid,
        status
      ) VALUES (
        v_sales_rep_id,
        NEW.project_id,
        NEW.id,
        'sales_projects',
        v_basis_type,
        v_basis_amount,
        v_sales_rate,
        v_basis_amount * v_sales_rate / 100,
        0,
        0,
        0,
        'pending'
      );
    END IF;
  END IF;
  
  -- Create Project Manager Commission Record
  IF v_pm_id IS NOT NULL AND v_pm_id != v_sales_rep_id THEN
    -- Check if employee is eligible
    IF EXISTS (
      SELECT 1 FROM employee_commission_config 
      WHERE employee_id = v_pm_id 
        AND eligible_for_commissions = true
    ) OR NOT EXISTS (
      SELECT 1 FROM employee_commission_config 
      WHERE employee_id = v_pm_id
    ) THEN
      v_pm_rate := get_effective_commission_rate(v_pm_id, 'pm');
      
      INSERT INTO commission_records (
        employee_id,
        project_id,
        invoice_id,
        role_type,
        basis_type,
        basis_amount,
        commission_rate,
        total_potential_commission,
        amount_collected,
        amount_earned,
        amount_paid,
        status
      ) VALUES (
        v_pm_id,
        NEW.project_id,
        NEW.id,
        'pm',
        v_basis_type,
        v_basis_amount,
        v_pm_rate,
        v_basis_amount * v_pm_rate / 100,
        0,
        0,
        0,
        'pending'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on invoices
DROP TRIGGER IF EXISTS trigger_create_commission_records ON invoices;
CREATE TRIGGER trigger_create_commission_records
  AFTER INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION create_commission_records_for_invoice();

-- Function to update commission earnings when payments are made
CREATE OR REPLACE FUNCTION update_commission_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice record;
  v_percentage_collected numeric;
  v_commission record;
BEGIN
  -- Get invoice_id from the payment
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_invoice FROM invoices WHERE id = OLD.invoice_id;
  ELSE
    SELECT * INTO v_invoice FROM invoices WHERE id = NEW.invoice_id;
  END IF;
  
  -- Skip if invoice has no total (avoid division by zero)
  IF v_invoice.total <= 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate percentage collected
  v_percentage_collected := LEAST(v_invoice.amount_paid / v_invoice.total, 1.0);
  
  -- Update all commission records for this invoice
  FOR v_commission IN 
    SELECT * FROM commission_records WHERE invoice_id = v_invoice.id
  LOOP
    UPDATE commission_records
    SET
      amount_collected = v_invoice.amount_paid,
      amount_earned = total_potential_commission * v_percentage_collected,
      status = CASE
        WHEN v_invoice.amount_paid = 0 THEN 'pending'
        WHEN v_invoice.amount_paid >= v_invoice.total THEN 'ready_to_pay'
        ELSE 'accruing'
      END,
      updated_at = now()
    WHERE id = v_commission.id;
  END LOOP;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on payments (use AFTER since invoice is updated first by existing trigger)
DROP TRIGGER IF EXISTS trigger_update_commission_on_payment ON payments;
CREATE TRIGGER trigger_update_commission_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_on_payment();

-- Also update commissions when invoice is updated (in case of manual adjustments)
DROP TRIGGER IF EXISTS trigger_update_commission_on_invoice_update ON invoices;
CREATE TRIGGER trigger_update_commission_on_invoice_update
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (OLD.amount_paid IS DISTINCT FROM NEW.amount_paid OR OLD.total IS DISTINCT FROM NEW.total)
  EXECUTE FUNCTION update_commission_on_payment();
