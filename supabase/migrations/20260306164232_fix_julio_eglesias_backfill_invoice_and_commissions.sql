/*
  # Fix Julio Eglesias: Backfill Invoice project_id and Create Commission Records

  ## Problem
  The invoice for Julio Eglesias (SO-01-25000) was created with `project_id = NULL`
  because the old approval trigger never set it. The commission trigger
  `create_commission_records_for_invoice` requires `project_id` to be set on the
  invoice to create commission records, so no commission records were ever created.

  ## Changes
  1. Updates invoice `7080377d` to set `project_id = 'b2d727dc'` (the linked project)
  2. Manually creates commission records for the sales rep (SO created_by) using the
     company default rates, mirroring what the trigger would have done
  3. Sets `salesperson_id` on the project to match the sales order's `created_by`

  ## Notes
  - Commission basis: 'gross', default sales rate: 5%, default PM rate: 1%
  - No PM is assigned to this project (assigned_pm is null), so only sales commission created
  - Invoice total: $15,233.58 → 5% = $761.68 potential sales commission
*/

DO $$
DECLARE
  v_invoice_id   uuid := '7080377d-6765-4cbc-a48a-fba264d5d901';
  v_project_id   uuid := 'b2d727dc-855f-4be5-a3a9-e8fb2ce38404';
  v_so_id        uuid := 'd8b30c4b-70d0-4180-aca0-907db5a5fa27';
  v_sales_rep_id uuid;
  v_invoice_total numeric;
  v_sales_rate    numeric;
  v_org_id        uuid;
BEGIN

  -- Step 1: Set project_id on the invoice
  UPDATE invoices
  SET project_id = v_project_id
  WHERE id = v_invoice_id
    AND (project_id IS NULL OR project_id != v_project_id);

  -- Step 2: Get sales rep (created_by on the sales order)
  SELECT created_by, contract_total, organization_id
  INTO v_sales_rep_id, v_invoice_total, v_org_id
  FROM sales_orders
  WHERE id = v_so_id;

  -- Use actual invoice total
  SELECT total INTO v_invoice_total FROM invoices WHERE id = v_invoice_id;

  -- Step 3: Set salesperson_id on the project
  UPDATE projects
  SET salesperson_id = v_sales_rep_id
  WHERE id = v_project_id
    AND (salesperson_id IS NULL OR salesperson_id != v_sales_rep_id);

  -- Step 4: Get company commission rate for sales
  SELECT COALESCE(default_sales_projects_rate, 5.0)
  INTO v_sales_rate
  FROM company_commission_settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF v_sales_rate IS NULL THEN
    v_sales_rate := 5.0;
  END IF;

  -- Step 5: Create commission record for sales rep if not already exists
  IF v_sales_rep_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM commission_records
    WHERE project_id = v_project_id
      AND invoice_id = v_invoice_id
      AND role_type = 'sales_projects'
  ) THEN
    INSERT INTO commission_records (
      employee_id,
      project_id,
      invoice_id,
      organization_id,
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
      v_project_id,
      v_invoice_id,
      v_org_id,
      'sales_projects',
      'gross',
      v_invoice_total,
      v_sales_rate,
      ROUND(v_invoice_total * v_sales_rate / 100, 2),
      0,
      0,
      0,
      'pending'
    );
  END IF;

END $$;
