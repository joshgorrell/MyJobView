-- Invoice Completion: QBO Void Pending, Tax Snapshot Fix, Idempotency
--
-- 1. qbo_void_pending column: tracks when an MJV-voided invoice still needs
--    its QBO counterpart voided. Scheduled sync retries via this flag.
--    MJV void is authoritative; QBO sync must never un-void an MJV-voided invoice.
-- 2. void_invoice() update: sets qbo_void_pending = true when qbo_invoice_id exists.
-- 3. write_tax_snapshot() fix: invoice branch now reads tax context from the
--    invoices table directly (not Proposal JOIN). Proposal fallback only when
--    invoice fields are NULL. Standalone invoices get complete snapshots.
-- 4. AFTER INSERT trigger for submitted invoices: covers deposit/recurring
--    invoices created directly as submitted.
-- 5. Idempotency guard: skip snapshot creation if tax_snapshot_id IS NOT NULL.

-- 1. Add qbo_void_pending column
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qbo_void_pending boolean NOT NULL DEFAULT false;

-- 2. Update void_invoice() to set qbo_void_pending
CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Invoice not found']);
  END IF;

  IF v_invoice.status NOT IN ('submitted', 'partial', 'paid', 'overdue') THEN
    RETURN jsonb_build_object('success', false, 'errors', ARRAY['Only submitted, partial, paid, or overdue invoices can be voided']);
  END IF;

  UPDATE invoices
  SET
    status = 'void',
    portal_visible = false,
    qbo_void_pending = (v_invoice.qbo_invoice_id IS NOT NULL),
    updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_number', v_invoice.invoice_number,
    'qbo_void_pending', v_invoice.qbo_invoice_id IS NOT NULL
  );
END;
$$;

-- 3. Fix write_tax_snapshot() invoice branch to read from invoices table directly
CREATE OR REPLACE FUNCTION public.write_tax_snapshot(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calc_result jsonb;
  v_snapshot_id uuid;
  v_org_id uuid;
  v_contact_id uuid;
  v_state text;
  v_environment text;
  v_project_type text;
  v_tax_rate numeric;
  v_material_amount numeric;
  v_labor_amount numeric;
  v_taxable_subtotal numeric;
  v_tax_amount numeric;
  v_origin_result jsonb;
  v_destination_result jsonb;
  v_exemption_ref text;
  v_nexus_status text;
BEGIN
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id, contact_id, tax_environment, tax_project_type, tax_rate,
           jobsite_state, tax_amount, parts_total, labor_total
    INTO v_org_id, v_contact_id, v_environment, v_project_type, v_tax_rate,
         v_state, v_tax_amount, v_material_amount, v_labor_amount
    FROM proposals WHERE id = p_transaction_id;
    v_taxable_subtotal := v_material_amount + v_labor_amount;

  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id, co.tax_environment, co.tax_project_type, co.tax_rate,
           co.tax_amount, co.subtotal_after_modifiers
    INTO v_org_id, v_environment, v_project_type, v_tax_rate,
         v_tax_amount, v_taxable_subtotal
    FROM change_orders co WHERE co.id = p_transaction_id;

    SELECT p.contact_id, p.jobsite_state
    INTO v_contact_id, v_state
    FROM proposals p JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

  ELSIF p_transaction_type = 'invoice' THEN
    -- Read tax context directly from the invoices table (authoritative for finalized invoices)
    SELECT organization_id, contact_id, tax_amount, total,
           tax_environment, tax_project_type, tax_rate,
           jobsite_state
    INTO v_org_id, v_contact_id, v_tax_amount, v_taxable_subtotal,
         v_environment, v_project_type, v_tax_rate,
         v_state
    FROM invoices WHERE id = p_transaction_id;

    -- If invoice's own tax context fields are NULL, fall back to proposal JOIN (backward compat)
    IF v_environment IS NULL AND v_state IS NULL THEN
      SELECT p.tax_environment, p.tax_project_type, p.tax_rate, p.jobsite_state
      INTO v_environment, v_project_type, v_tax_rate, v_state
      FROM proposals p
      JOIN invoices inv ON inv.proposal_id = p.id
      WHERE inv.id = p_transaction_id LIMIT 1;
    END IF;

  ELSE
    RETURN NULL;
  END IF;

  -- Run the orchestrator
  v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);

  -- Extract results
  v_origin_result := v_calc_result->'origin_result';
  v_destination_result := v_calc_result->'destination_result';
  v_exemption_ref := v_calc_result->>'exemption_reference';
  v_nexus_status := v_calc_result->>'collection_status';

  -- Insert the snapshot
  INSERT INTO tax_snapshots (
    organization_id,
    transaction_type,
    transaction_id,
    contact_id,
    state,
    environment,
    project_type,
    tax_calculation_status,
    taxability_results,
    origin_method,
    origin_office_id,
    origin_address,
    destination_address,
    collection_status,
    nexus_result,
    exemption_reference,
    taxable_subtotal,
    sales_tax,
    calculated_at
  ) VALUES (
    v_org_id,
    p_transaction_type,
    p_transaction_id,
    v_contact_id,
    v_state,
    v_environment,
    v_project_type,
    v_calc_result->>'tax_calculation_status',
    v_calc_result->'taxability_results',
    v_origin_result->>'origin_method',
    (v_origin_result->>'office_id')::uuid,
    v_origin_result,
    v_destination_result,
    v_calc_result->>'collection_status',
    v_nexus_status,
    v_exemption_ref,
    COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
    COALESCE((v_calc_result->>'tax_amount')::numeric, 0),
    now()
  ) RETURNING id INTO v_snapshot_id;

  -- Update the transaction's snapshot FK
  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  END IF;

  RETURN v_snapshot_id;
END;
$function$;

-- 4. Update write_tax_snapshot_on_invoice_finalized with idempotency guard
CREATE OR REPLACE FUNCTION public.write_tax_snapshot_on_invoice_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Idempotency: skip if invoice already has a tax snapshot
  IF NEW.tax_snapshot_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM write_tax_snapshot('invoice', NEW.id);
  RETURN NEW;
END;
$function$;

-- 5. Recreate the AFTER UPDATE trigger (now with idempotency guard in the function)
DROP TRIGGER IF EXISTS trigger_tax_snapshot_invoice_finalized ON invoices;
CREATE TRIGGER trigger_tax_snapshot_invoice_finalized
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND COALESCE(OLD.status, '') <> 'submitted')
  EXECUTE FUNCTION write_tax_snapshot_on_invoice_finalized();

-- 6. Add AFTER INSERT trigger for invoices created directly as 'submitted'
DROP TRIGGER IF EXISTS trigger_tax_snapshot_invoice_on_insert ON invoices;
CREATE TRIGGER trigger_tax_snapshot_invoice_on_insert
  AFTER INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'submitted')
  EXECUTE FUNCTION write_tax_snapshot_on_invoice_finalized();
