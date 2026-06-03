/*
  # Fix Project Creation on Proposal Approval + Task Generation

  ## Problems Fixed
  1. `handle_proposal_approval` never created a Project record.
  2. `generate_project_tasks_on_project_creation` used non-existent column
     `pli.product_name`, had a DISTINCT/ORDER BY mismatch, and didn't pass
     `organization_id` to project_tasks (NOT NULL column).

  ## Changes
  1. Fix `generate_project_tasks_on_project_creation` — use `pli.description`,
     fix ORDER BY, add organization_id to task inserts.
  2. Add `project_id` column to `sales_orders`.
  3. Add `generate_project_number()` helper.
  4. Replace `handle_proposal_approval` to also create a Project after the SO.
  5. Backfill Projects for existing sales orders.
*/

-- ============================================================
-- 1. Fix generate_project_tasks_on_project_creation
-- ============================================================
CREATE OR REPLACE FUNCTION generate_project_tasks_on_project_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id     uuid;
  v_task_sort_order integer := 0;
  v_line_item       record;
  v_labor_phase     record;
  v_task_description text;
  v_has_labor_phases boolean;
BEGIN
  IF NEW.sales_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT so.proposal_id INTO v_proposal_id
  FROM sales_orders so
  WHERE so.id = NEW.sales_order_id
  LIMIT 1;

  IF v_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_line_item IN (
    SELECT
      pli.id         AS line_item_id,
      pli.description,
      pli.task_notes,
      pr.name        AS room_name,
      COALESCE(pr.sort_order, 0) AS room_sort,
      COALESCE(pli.sort_order, 0) AS item_sort
    FROM proposal_line_items pli
    LEFT JOIN proposal_rooms pr ON pr.id = pli.room_id
    WHERE pli.proposal_id = v_proposal_id
    AND (
      EXISTS (
        SELECT 1 FROM proposal_line_item_labor_phases plilp
        WHERE plilp.line_item_id = pli.id
      )
      OR (pli.task_notes IS NOT NULL AND pli.task_notes != '')
    )
    ORDER BY COALESCE(pr.sort_order, 0), COALESCE(pli.sort_order, 0)
  )
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM proposal_line_item_labor_phases
      WHERE line_item_id = v_line_item.line_item_id
    ) INTO v_has_labor_phases;

    IF v_has_labor_phases THEN
      FOR v_labor_phase IN (
        SELECT
          plilp.labor_phase_id,
          plilp.hours,
          plilp.tech_notes,
          lp.name AS phase_name
        FROM proposal_line_item_labor_phases plilp
        JOIN labor_phases lp ON lp.id = plilp.labor_phase_id
        WHERE plilp.line_item_id = v_line_item.line_item_id
        ORDER BY plilp.sort_order
      )
      LOOP
        v_task_description := COALESCE(
          NULLIF(v_labor_phase.tech_notes, ''),
          NULLIF(v_line_item.task_notes, ''),
          v_line_item.description
        );

        INSERT INTO project_tasks (
          project_id, organization_id, title, description,
          labor_phase_id, estimated_hours,
          status, sort_order, source_line_item_id, source_phase_id,
          created_by, created_at, updated_at
        ) VALUES (
          NEW.id,
          NEW.organization_id,
          COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.description || ' - ' || v_labor_phase.phase_name,
          v_task_description,
          v_labor_phase.labor_phase_id,
          v_labor_phase.hours,
          'open',
          v_task_sort_order,
          v_line_item.line_item_id,
          v_labor_phase.labor_phase_id,
          NEW.created_by,
          now(), now()
        );
        v_task_sort_order := v_task_sort_order + 1;
      END LOOP;
    ELSE
      INSERT INTO project_tasks (
        project_id, organization_id, title, description,
        status, sort_order, source_line_item_id,
        created_by, created_at, updated_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        COALESCE(v_line_item.room_name || ' - ', '') || v_line_item.description,
        COALESCE(NULLIF(v_line_item.task_notes, ''), v_line_item.description),
        'open',
        v_task_sort_order,
        v_line_item.line_item_id,
        NEW.created_by,
        now(), now()
      );
      v_task_sort_order := v_task_sort_order + 1;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. project_id on sales_orders (back-reference)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE sales_orders ADD COLUMN project_id uuid REFERENCES projects(id);
  END IF;
END $$;

-- ============================================================
-- 3. Helper: derive project number from sales order number
-- ============================================================
CREATE OR REPLACE FUNCTION generate_project_number(p_sales_order_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN regexp_replace(p_sales_order_number, '^SO-', 'PRJ-');
END;
$$;

-- ============================================================
-- 4. Replace handle_proposal_approval — now also creates Project
-- ============================================================
CREATE OR REPLACE FUNCTION handle_proposal_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id       uuid;
  v_project_id           uuid;
  v_order_number         text;
  v_project_number       text;
  v_invoice_id           uuid;
  v_invoice_number       text;
  v_deposit_amount       numeric;
  v_require_deposit      boolean;
  v_accepted_via_method  text;
  v_customer_name        text;
  v_sales_order_status   text;
BEGIN
  IF NEW.status = 'approved'
    AND OLD.status != 'approved'
    AND NEW.sales_order_id IS NULL
    AND NEW.billing_action_taken = false
  THEN

    SELECT COALESCE(full_name, contact_name, email, 'Customer')
    INTO v_customer_name
    FROM contacts WHERE id = NEW.contact_id;

    v_require_deposit     := COALESCE(NEW.require_deposit, true);
    v_deposit_amount      := COALESCE(NEW.deposit_amount_due, 0);
    v_accepted_via_method := NEW.accepted_via_method;

    IF v_accepted_via_method IS NULL THEN
      v_accepted_via_method   := 'verbal';
      NEW.accepted_via_method := 'verbal';
    END IF;

    IF NEW.approval_completed_at IS NULL THEN
      NEW.approval_completed_at := now();
    END IF;

    v_order_number   := generate_sales_order_number(NEW.proposal_number);
    v_project_number := generate_project_number(v_order_number);

    IF v_accepted_via_method = 'purchase_order' THEN
      v_sales_order_status    := 'planning';
      NEW.billing_action_type := 'purchase_order';
      IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
        RAISE EXCEPTION 'Purchase Order number is required for PO acceptance';
      END IF;

    ELSIF NOT v_require_deposit THEN
      v_sales_order_status    := 'planning';
      NEW.billing_action_type := 'no_deposit_required';

    ELSIF NEW.deposit_paid THEN
      v_sales_order_status    := 'planning';
      NEW.billing_action_type := 'deposit_invoice';

      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();
        INSERT INTO invoices (
          company_id, proposal_id, contact_id, invoice_number,
          invoice_type, invoice_date, due_date, source_type,
          subtotal, tax_amount, tax_rate, tax_environment, tax_project_type,
          total, amount_due, status, payment_terms, notes, created_by
        ) VALUES (
          NEW.company_id, NEW.id, NEW.contact_id, v_invoice_number,
          'deposit', CURRENT_DATE, CURRENT_DATE, 'deposit',
          v_deposit_amount, 0,
          COALESCE(NEW.tax_rate, 0),
          COALESCE(NEW.tax_environment, 'residential'),
          COALESCE(NEW.tax_project_type, 'general_installation_repair'),
          v_deposit_amount, 0, 'paid', 'Paid',
          'Deposit payment received for ' || v_customer_name,
          NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, is_taxable)
        VALUES (v_invoice_id, 'Deposit for Proposal ' || NEW.proposal_number, 1, v_deposit_amount, v_deposit_amount, false);

        INSERT INTO invoice_payments (
          company_id, invoice_id, proposal_id, payment_date, amount,
          payment_method, reference_number, notes, created_by
        ) VALUES (
          NEW.company_id, v_invoice_id, NEW.id,
          COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
          v_deposit_amount, 'other',
          'Deposit - Proposal ' || NEW.proposal_number,
          'Deposit payment recorded at approval', NEW.approved_by
        );
        NEW.deposit_invoice_id := v_invoice_id;
      END IF;

    ELSE
      v_sales_order_status        := 'pending_deposit';
      NEW.billing_action_type     := 'deposit_invoice';
      NEW.deposit_request_sent    := true;
      NEW.deposit_request_sent_at := now();

      IF v_deposit_amount > 0 THEN
        v_invoice_number := generate_invoice_number();
        INSERT INTO invoices (
          company_id, proposal_id, contact_id, invoice_number,
          invoice_type, invoice_date, due_date, source_type,
          subtotal, tax_amount, tax_rate, tax_environment, tax_project_type,
          total, amount_due, status, payment_terms, notes, created_by
        ) VALUES (
          NEW.company_id, NEW.id, NEW.contact_id, v_invoice_number,
          'deposit', CURRENT_DATE, CURRENT_DATE, 'deposit',
          v_deposit_amount, 0,
          COALESCE(NEW.tax_rate, 0),
          COALESCE(NEW.tax_environment, 'residential'),
          COALESCE(NEW.tax_project_type, 'general_installation_repair'),
          v_deposit_amount, v_deposit_amount, 'sent', 'Due upon receipt',
          'Deposit invoice for ' || v_customer_name, NEW.approved_by
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, is_taxable)
        VALUES (v_invoice_id, 'Deposit for Proposal ' || NEW.proposal_number, 1, v_deposit_amount, v_deposit_amount, false);

        NEW.deposit_invoice_id := v_invoice_id;
      END IF;
    END IF;

    -- Create Sales Order
    INSERT INTO sales_orders (
      company_id, proposal_id, contact_id, order_number, status,
      contract_total, payment_terms, notes, created_by
    ) VALUES (
      NEW.company_id, NEW.id, NEW.contact_id, v_order_number,
      v_sales_order_status, NEW.total, COALESCE(NEW.payment_terms, 'Net 30'),
      CASE
        WHEN v_accepted_via_method = 'purchase_order'
          THEN 'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number
        WHEN NEW.deposit_paid
          THEN 'Converted from proposal ' || NEW.proposal_number || ' - Deposit received'
        WHEN v_require_deposit AND NOT NEW.deposit_paid
          THEN 'Converted from proposal ' || NEW.proposal_number || ' - Pending deposit payment'
        ELSE 'Converted from proposal ' || NEW.proposal_number
      END,
      NEW.approved_by
    ) RETURNING id INTO v_sales_order_id;

    NEW.sales_order_id := v_sales_order_id;

    IF v_invoice_id IS NOT NULL THEN
      UPDATE invoices SET sales_order_id = v_sales_order_id WHERE id = v_invoice_id;
    END IF;

    -- Create Project
    INSERT INTO projects (
      company_id,
      organization_id,
      sales_order_id,
      contact_id,
      project_number,
      name,
      status,
      created_by
    ) VALUES (
      NEW.company_id,
      NEW.organization_id,
      v_sales_order_id,
      NEW.contact_id,
      v_project_number,
      COALESCE(NEW.title, 'Project for ' || NEW.proposal_number),
      'planning',
      NEW.approved_by
    ) RETURNING id INTO v_project_id;

    UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

    -- Notify sales rep
    IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
      BEGIN
        INSERT INTO notifications (user_id, type, title, message, related_id)
        VALUES (
          COALESCE(NEW.assigned_to, NEW.created_by),
          'proposal_approved',
          'Customer Approved Proposal',
          v_customer_name || ' approved proposal ' || NEW.proposal_number || '. ' ||
          CASE
            WHEN v_accepted_via_method = 'purchase_order'
              THEN 'Sales order and project created with PO #' || NEW.purchase_order_number || '.'
            WHEN NEW.deposit_paid
              THEN 'Deposit received. Sales order and project ready for scheduling.'
            WHEN v_require_deposit AND NOT NEW.deposit_paid
              THEN 'Deposit invoice created. Project created and pending deposit.'
            ELSE 'Sales order and project created, ready for scheduling.'
          END,
          NEW.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create notification: %', SQLERRM;
      END;
    END IF;

    NEW.billing_action_taken := true;
    NEW.billing_action_at    := now();
    NEW.billing_action_by    := NEW.approved_by;

  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Backfill Projects for existing sales orders with none
-- ============================================================
DO $$
DECLARE
  v_so         record;
  v_proposal   record;
  v_project_id     uuid;
  v_project_number text;
  v_org_id         uuid;
BEGIN
  FOR v_so IN
    SELECT so.id, so.order_number, so.company_id, so.contact_id,
           so.proposal_id, so.created_by, so.contract_total
    FROM sales_orders so
    WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.sales_order_id = so.id)
  LOOP
    SELECT id, title, proposal_number, organization_id
    INTO v_proposal
    FROM proposals
    WHERE id = v_so.proposal_id;

    v_org_id := COALESCE(
      v_proposal.organization_id,
      (SELECT organization_id FROM profiles WHERE id = v_so.created_by LIMIT 1)
    );

    v_project_number := generate_project_number(v_so.order_number);

    INSERT INTO projects (
      company_id, organization_id, sales_order_id, contact_id,
      project_number, name, status, created_by
    ) VALUES (
      v_so.company_id,
      v_org_id,
      v_so.id,
      v_so.contact_id,
      v_project_number,
      COALESCE(v_proposal.title, 'Project ' || v_project_number),
      'planning',
      v_so.created_by
    ) RETURNING id INTO v_project_id;

    UPDATE sales_orders SET project_id = v_project_id WHERE id = v_so.id;
  END LOOP;
END $$;
