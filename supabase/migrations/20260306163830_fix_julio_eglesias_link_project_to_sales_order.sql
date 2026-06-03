/*
  # Fix Julio Eglesias - Link Project to Sales Order

  ## Problem
  The project (PRJ-01-25000) and sales order (SO-01-25000) for Julio Eglesias exist but
  are not linked to each other. Both have null foreign keys pointing to the other record.

  ## Fix
  1. Set projects.sales_order_id = 'd8b30c4b-...' on the existing project
  2. Set sales_orders.project_id = 'b2d727dc-...' on the existing sales order

  This will make the Project tab and Commissions tab visible in the Sales Order detail view.
*/

DO $$
DECLARE
  v_so_id      uuid := 'd8b30c4b-70d0-4180-aca0-907db5a5fa27';
  v_project_id uuid := 'b2d727dc-855f-4be5-a3a9-e8fb2ce38404';
BEGIN
  -- Link project -> sales order
  UPDATE projects
  SET sales_order_id = v_so_id
  WHERE id = v_project_id
    AND (sales_order_id IS NULL OR sales_order_id != v_so_id);

  -- Link sales order -> project
  UPDATE sales_orders
  SET project_id = v_project_id
  WHERE id = v_so_id
    AND (project_id IS NULL OR project_id != v_project_id);
END $$;
