/*
# Create tax snapshot writing function and lifecycle triggers

## Purpose
Creates a function to write an authoritative tax snapshot at key lifecycle
points. The snapshot preserves the actual tax decision, origin address,
destination address, nexus status, and rule results used at the time of
calculation so that later changes do not alter historical tax context.

## New Function
- `write_tax_snapshot(p_transaction_type text, p_transaction_id uuid)`
  - SECURITY DEFINER, VOLATILE, search_path = 'public'
  - Calls calculate_tax to get the current tax calculation
  - Inserts a row into tax_snapshots with all context
  - Updates the transaction's tax_snapshot_id FK
  - Returns the snapshot UUID

## Lifecycle Triggers
1. Proposal sent: AFTER UPDATE ON proposals WHEN status changes to 'sent'
2. Proposal approved: AFTER UPDATE ON proposals WHEN status changes to 'approved'
3. Change order approved: AFTER UPDATE ON change_orders WHEN status changes to 'approved'
4. Invoice finalized: AFTER UPDATE ON invoices WHEN status changes to sent/issued/finalized

## Security
- SECURITY DEFINER on write_tax_snapshot.
- RLS on tax_snapshots already enabled.

## Notes
- Snapshots are NOT written during draft editing.
- The snapshot stores the actual office_id, origin address, and tax rule
  results at the time of the snapshot.
*/

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
  -- Load transaction record
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
    SELECT organization_id, contact_id, tax_amount, total
    INTO v_org_id, v_contact_id, v_tax_amount, v_taxable_subtotal
    FROM invoices WHERE id = p_transaction_id;

    SELECT p.tax_environment, p.tax_project_type, p.tax_rate, p.jobsite_state
    INTO v_environment, v_project_type, v_tax_rate, v_state
    FROM proposals p
    JOIN invoices inv ON (inv.proposal_id = p.id)
    WHERE inv.id = p_transaction_id LIMIT 1;

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

-- ── Trigger: proposal sent ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_tax_snapshot_on_proposal_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM write_tax_snapshot('proposal', NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_tax_snapshot_proposal_sent ON proposals;
CREATE TRIGGER trigger_tax_snapshot_proposal_sent
  AFTER UPDATE ON proposals
  FOR EACH ROW
  WHEN (NEW.status = 'sent' AND OLD.status <> 'sent')
  EXECUTE FUNCTION write_tax_snapshot_on_proposal_sent();

-- ── Trigger: proposal approved ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_tax_snapshot_on_proposal_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM write_tax_snapshot('proposal', NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_tax_snapshot_proposal_approved ON proposals;
CREATE TRIGGER trigger_tax_snapshot_proposal_approved
  AFTER UPDATE ON proposals
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status <> 'approved')
  EXECUTE FUNCTION write_tax_snapshot_on_proposal_approved();

-- ── Trigger: change order approved ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_tax_snapshot_on_co_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM write_tax_snapshot('change_order', NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_tax_snapshot_co_approved ON change_orders;
CREATE TRIGGER trigger_tax_snapshot_co_approved
  AFTER UPDATE ON change_orders
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status <> 'approved')
  EXECUTE FUNCTION write_tax_snapshot_on_co_approved();

-- ── Trigger: invoice finalized ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_tax_snapshot_on_invoice_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM write_tax_snapshot('invoice', NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_tax_snapshot_invoice_finalized ON invoices;
CREATE TRIGGER trigger_tax_snapshot_invoice_finalized
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'issued', 'finalized')
        AND COALESCE(OLD.status, '') NOT IN ('sent', 'issued', 'finalized'))
  EXECUTE FUNCTION write_tax_snapshot_on_invoice_finalized();
