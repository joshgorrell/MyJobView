/*
# Create calculate_tax orchestrator function

## Purpose
Combines the five independent tax layers into a single authoritative tax
calculation. This is the single entry point for authoritative tax calculation
on proposals, change orders, and invoices.

The orchestrator does NOT make taxability decisions itself. It calls the
layer functions and combines their results:

  A. Taxability  — resolve_tax_rule (per classification)
  B. Origin      — resolve_tax_origin_address
  C. Collection  — dealer_nexus_states query
  D. Destination — validated from the transaction's jobsite/contact address
  E. Readiness   — determined from the above four results

## New Function
- `calculate_tax(p_transaction_type text, p_transaction_id uuid)`
  - SECURITY DEFINER, VOLATILE, search_path = 'public'
  - Returns jsonb with: tax_calculation_status, taxability_results,
    origin_result, collection_status, destination_result, tax_amount,
    taxable_subtotal, review_reasons, exemption_reference

## Process
1. Load the transaction record (proposal, change_order, or invoice)
2. Resolve origin address via resolve_tax_origin_address
3. Resolve taxability for material and labor via resolve_tax_rule
4. Check nexus via dealer_nexus_states
5. Validate destination address from the transaction's jobsite fields
6. Check exemption via tax_exemption_certificates
7. Determine tax_calculation_status:
   - exempt: valid exemption certificate exists
   - not_collecting: nexus_status = 'no'
   - review_required: any layer needs review
   - ready: all layers pass
8. If ready: calculate tax_amount = taxable_subtotal * tax_rate
9. Update the transaction record with tax_review_required and
   tax_calculation_status

## Security
- SECURITY DEFINER so it can read/write all involved tables.
- search_path = 'public'.

## Notes
- The function reads the tax_rate from the transaction record (stored by
  the user or auto-filled from tax_jurisdictions). TaxJar integration for
  rate lookup is a separate concern.
- The function writes tax_review_required and tax_calculation_status back
  to the transaction record.
- The function does NOT write a tax snapshot — that is done at lifecycle
  points (proposal sent/approved, etc.) by a separate function.
*/

CREATE OR REPLACE FUNCTION public.calculate_tax(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_office_id uuid;
  v_contact_id uuid;
  v_state text;
  v_environment text;
  v_project_type text;
  v_tax_rate numeric;
  v_jobsite_street text;
  v_jobsite_city text;
  v_jobsite_state text;
  v_jobsite_zip text;

  v_material_taxability jsonb;
  v_labor_taxability jsonb;
  v_taxability_results jsonb;
  v_origin_result jsonb;
  v_collection_status text;
  v_nexus_status text;
  v_destination_result jsonb;
  v_is_exempt boolean := false;
  v_exemption_ref text;

  v_tax_calculation_status text;
  v_review_reasons jsonb[] := ARRAY[]::jsonb[];
  v_material_amount numeric := 0;
  v_labor_amount numeric := 0;
  v_taxable_subtotal numeric := 0;
  v_tax_amount numeric := 0;

  v_trans record;
BEGIN
  -- ── 1. Load the transaction record ──────────────────────────────────
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id, office_id, contact_id, tax_environment, tax_project_type,
           tax_rate, jobsite_address, jobsite_city, jobsite_state, jobsite_zip
    INTO v_org_id, v_office_id, v_contact_id, v_environment, v_project_type,
         v_tax_rate, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Proposal not found');
    END IF;

    -- Get parts and labor totals
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(item_type, 'part') != 'labor' AND COALESCE(is_customer_supplied, false) = false THEN line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN item_type = 'labor' THEN COALESCE(labor_total, line_total) ELSE COALESCE(labor_total, 0) END), 0)
    INTO v_material_amount, v_labor_amount
    FROM proposal_line_items WHERE proposal_id = p_transaction_id;

  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id, co.tax_environment, co.tax_project_type, co.tax_rate
    INTO v_org_id, v_environment, v_project_type, v_tax_rate
    FROM change_orders co WHERE co.id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Change order not found');
    END IF;

    -- Resolve office_id and contact_id from the originating proposal
    SELECT p.office_id, p.contact_id, p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_office_id, v_contact_id, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

    -- Get net change amount as the basis
    SELECT COALESCE(SUM(change_amount), 0) INTO v_material_amount
    FROM change_order_line_items
    WHERE change_order_id = p_transaction_id AND action_type <> 'modify_modifiers';

    -- For change orders, we treat the net change as a single taxable base.
    -- The resolver determines if it's taxable; we don't split material/labor
    -- for change orders in the current system.
    v_labor_amount := 0;

  ELSIF p_transaction_type = 'invoice' THEN
    SELECT organization_id, office_id, contact_id
    INTO v_org_id, v_office_id, v_contact_id
    FROM invoices WHERE id = p_transaction_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Invoice not found');
    END IF;

    -- Get tax fields from the originating proposal or sales order
    SELECT p.tax_environment, p.tax_project_type, p.tax_rate,
           p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_environment, v_project_type, v_tax_rate,
         v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN invoices inv ON (inv.proposal_id = p.id OR inv.sales_order_id IN (
      SELECT so.id FROM sales_orders so WHERE so.proposal_id = p.id
    ))
    WHERE inv.id = p_transaction_id
    LIMIT 1;

    -- Get invoice line item totals
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(item_type, 'part') != 'labor' THEN line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN item_type = 'labor' THEN line_total ELSE 0 END), 0)
    INTO v_material_amount, v_labor_amount
    FROM invoice_line_items WHERE invoice_id = p_transaction_id;

  ELSE
    RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
  END IF;

  v_state := COALESCE(v_jobsite_state, '');
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_environment := COALESCE(v_environment, 'residential');
  v_project_type := COALESCE(v_project_type, 'general_installation_repair');

  -- ── 2. Resolve origin address ────────────────────────────────────────
  v_origin_result := resolve_tax_origin_address(v_org_id, v_office_id);
  IF (v_origin_result->>'review_required')::boolean THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'origin', 'reason', v_origin_result->>'review_reason'));
  END IF;

  -- ── 3. Resolve taxability ────────────────────────────────────────────
  v_material_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'material');
  v_labor_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'labor');

  v_taxability_results := jsonb_build_object(
    'material', v_material_taxability,
    'labor', v_labor_taxability
  );

  IF v_material_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'material', 'reason', v_material_taxability->>'explanation'));
  END IF;

  IF v_labor_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'labor', 'reason', v_labor_taxability->>'explanation'));
  END IF;

  -- ── 4. Check nexus/collection ────────────────────────────────────────
  SELECT nexus_status INTO v_nexus_status
  FROM dealer_nexus_states
  WHERE organization_id = v_org_id
    AND state = v_state
    AND is_current = true
  LIMIT 1;

  v_nexus_status := COALESCE(v_nexus_status, 'unknown');

  IF v_nexus_status = 'yes' THEN
    v_collection_status := 'collect';
  ELSIF v_nexus_status = 'no' THEN
    v_collection_status := 'do_not_collect';
  ELSE
    v_collection_status := 'review_required';
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'nexus', 'reason', 'Nexus status unknown for state ' || v_state));
  END IF;

  -- ── 5. Validate destination ──────────────────────────────────────────
  IF COALESCE(v_jobsite_street, '') = '' OR COALESCE(v_jobsite_city, '') = ''
     OR COALESCE(v_jobsite_state, '') = '' OR COALESCE(v_jobsite_zip, '') = '' THEN
    v_destination_result := jsonb_build_object(
      'street', v_jobsite_street, 'city', v_jobsite_city,
      'state', v_jobsite_state, 'zip', v_jobsite_zip,
      'review_required', true,
      'review_reason', 'Destination/jobsite address is incomplete'
    );
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'destination', 'reason', 'Jobsite address incomplete'));
  ELSE
    v_destination_result := jsonb_build_object(
      'street', v_jobsite_street, 'city', v_jobsite_city,
      'state', v_jobsite_state, 'zip', v_jobsite_zip,
      'review_required', false
    );
  END IF;

  -- ── 6. Check exemption ──────────────────────────────────────────────
  IF v_contact_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tax_exemption_certificates
      WHERE contact_id = v_contact_id
        AND is_active = true
        AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
    ) INTO v_is_exempt;

    IF v_is_exempt THEN
      SELECT COALESCE(certificate_number, id::text) INTO v_exemption_ref
      FROM tax_exemption_certificates
      WHERE contact_id = v_contact_id
        AND is_active = true
        AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
      LIMIT 1;
    END IF;
  END IF;

  -- ── 7. Determine calculation status ─────────────────────────────────
  IF v_is_exempt THEN
    v_tax_calculation_status := 'exempt';
    v_tax_amount := 0;
  ELSIF v_collection_status = 'do_not_collect' THEN
    v_tax_calculation_status := 'not_collecting';
    v_tax_amount := 0;
  ELSIF array_length(v_review_reasons, 1) > 0 THEN
    v_tax_calculation_status := 'review_required';
    v_tax_amount := 0;
  ELSE
    v_tax_calculation_status := 'ready';

    -- Calculate taxable subtotal based on taxability results
    IF v_material_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_material_amount;
    END IF;
    IF v_labor_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_labor_amount;
    END IF;

    v_tax_amount := round(v_taxable_subtotal * v_tax_rate, 2);
  END IF;

  -- ── 8. Update the transaction record ─────────────────────────────────
  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET
      tax_review_required = (v_tax_calculation_status = 'review_required'),
      tax_calculation_status = v_tax_calculation_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;

  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET
      tax_review_required = (v_tax_calculation_status = 'review_required'),
      tax_calculation_status = v_tax_calculation_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;

  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET
      tax_review_required = (v_tax_calculation_status = 'review_required'),
      tax_calculation_status = v_tax_calculation_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'tax_calculation_status', v_tax_calculation_status,
    'taxability_results', v_taxability_results,
    'origin_result', v_origin_result,
    'collection_status', v_collection_status,
    'destination_result', v_destination_result,
    'tax_amount', v_tax_amount,
    'taxable_subtotal', v_taxable_subtotal,
    'review_reasons', to_jsonb(v_review_reasons),
    'exemption_reference', v_exemption_ref
  );
END;
$function$;
