/*
# Phase 2 Fix: Lock down SECURITY DEFINER tax functions

## Purpose
All six tax SECURITY DEFINER functions currently have PUBLIC:EXECUTE,
meaning any anonymous or authenticated user can call them directly and
bypass RLS. This migration:

1. Revokes EXECUTE from PUBLIC and anon on ALL six tax functions.
2. Revokes EXECUTE from authenticated on the four server-only functions
   (persist_taxjar_result, mark_tax_review_required, write_tax_snapshot,
   resolve_tax_origin_address, resolve_tax_rule) — these are called only
   by the Edge Function using the service role key.
3. Keeps EXECUTE on calculate_tax for authenticated users (client-callable
   for draft display) but adds an organization authorization check inside
   the function body: the calling user's organization_id must match the
   transaction's organization_id.

## Functions affected
- calculate_tax — authenticated only, with org check added inside
- persist_taxjar_result — service role only (no client grants)
- mark_tax_review_required — service role only (no client grants)
- write_tax_snapshot — service role only (no client grants)
- resolve_tax_origin_address — service role only (no client grants)
- resolve_tax_rule — service role only (no client grants)

## Security
- No RLS changes.
- No schema changes.
- Only function grants and function bodies are modified.
*/

-- ── 1. Revoke PUBLIC/anon EXECUTE from all six functions ──────────────
REVOKE EXECUTE ON FUNCTION public.calculate_tax(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_tax(text, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.persist_taxjar_result(text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.persist_taxjar_result(text, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.persist_taxjar_result(text, uuid, jsonb) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_tax_review_required(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_tax_review_required(text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_tax_review_required(text, uuid, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.write_tax_snapshot(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.write_tax_snapshot(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.write_tax_snapshot(text, uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_tax_origin_address(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_tax_origin_address(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_tax_origin_address(uuid, uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_tax_rule(text, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_tax_rule(text, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_tax_rule(text, uuid, text, text, text) FROM authenticated;

-- ── 2. Grant EXECUTE on calculate_tax to authenticated only ────────────
-- calculate_tax is client-callable for draft display, but the function
-- body now includes an org authorization check.
GRANT EXECUTE ON FUNCTION public.calculate_tax(text, uuid) TO authenticated;

-- ── 3. Rewrite calculate_tax with org authorization check ──────────────
-- The function now verifies auth.uid() belongs to the transaction's
-- organization before proceeding. If the caller's org does not match,
-- it returns an error. The service role (used by the Edge Function) has
-- auth.uid() = NULL, so we skip the check when auth.uid() IS NULL.
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
  v_freight_taxability jsonb;
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
  v_freight_amount numeric := 0;
  v_taxable_subtotal numeric := 0;
  v_tax_amount numeric := 0;

  v_caller_org_id uuid;
  v_freight_sc_id uuid;
  v_cm1_sc_id uuid;
  v_cm2_sc_id uuid;
  v_cm1_amount numeric;
  v_cm2_amount numeric;
  v_cm1_apply boolean;
  v_cm2_apply boolean;
BEGIN
  -- ── 0. Organization authorization check ──────────────────────────────
  -- When called by an authenticated user (not the service role), verify
  -- the user belongs to the transaction's organization.
  v_caller_org_id := auth.uid();
  IF v_caller_org_id IS NOT NULL THEN
    IF p_transaction_type = 'proposal' THEN
      SELECT organization_id INTO v_org_id FROM proposals WHERE id = p_transaction_id;
    ELSIF p_transaction_type = 'change_order' THEN
      SELECT co.organization_id INTO v_org_id FROM change_orders co WHERE co.id = p_transaction_id;
    ELSIF p_transaction_type = 'invoice' THEN
      SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_transaction_id;
    ELSE
      RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
    END IF;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Transaction not found');
    END IF;

    SELECT p.organization_id INTO v_caller_org_id
    FROM profiles p WHERE p.id = v_caller_org_id;

    IF v_caller_org_id IS NULL OR v_caller_org_id <> v_org_id THEN
      RETURN jsonb_build_object('error', 'You do not have access to this transaction');
    END IF;

    -- Reset for normal flow (will be reloaded below)
    v_org_id := NULL;
  END IF;

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

    -- ── Resolve freight/delivery amount from custom modifiers ──────────
    -- Proposals inherit modifier special_charge_id from proposal_settings.
    -- Check both modifier slots to see which one is freight_delivery.
    SELECT scc.id INTO v_freight_sc_id
    FROM special_charge_classifications scc
    WHERE scc.code = 'freight_delivery';

    SELECT ps.custom_modifier_1_special_charge_id,
           ps.custom_modifier_2_special_charge_id
    INTO v_cm1_sc_id, v_cm2_sc_id
    FROM proposal_settings ps
    WHERE ps.proposal_id = p_transaction_id;

    -- Get the modifier amounts from the proposal itself
    SELECT p.custom_modifier_1_amount, p.custom_modifier_2_amount
    INTO v_cm1_amount, v_cm2_amount
    FROM proposals p WHERE p.id = p_transaction_id;

    IF v_cm1_sc_id = v_freight_sc_id AND v_cm1_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm1_amount;
    END IF;
    IF v_cm2_sc_id = v_freight_sc_id AND v_cm2_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm2_amount;
    END IF;

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

    v_labor_amount := 0;

    -- ── Resolve freight/delivery amount from change order modifiers ────
    SELECT scc.id INTO v_freight_sc_id
    FROM special_charge_classifications scc
    WHERE scc.code = 'freight_delivery';

    SELECT co.custom_modifier_1_special_charge_id,
           co.custom_modifier_2_special_charge_id,
           co.custom_modifier_1_amount,
           co.custom_modifier_2_amount,
           co.apply_custom_modifier_1,
           co.apply_custom_modifier_2
    INTO v_cm1_sc_id, v_cm2_sc_id, v_cm1_amount, v_cm2_amount, v_cm1_apply, v_cm2_apply
    FROM change_orders co WHERE co.id = p_transaction_id;

    IF v_cm1_sc_id = v_freight_sc_id AND COALESCE(v_cm1_apply, true) AND v_cm1_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm1_amount;
    END IF;
    IF v_cm2_sc_id = v_freight_sc_id AND COALESCE(v_cm2_apply, true) AND v_cm2_amount IS NOT NULL THEN
      v_freight_amount := v_freight_amount + v_cm2_amount;
    END IF;

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

    -- Invoices do not have separate freight/delivery modifier columns.
    -- Freight is already included in the invoice line items, so
    -- v_freight_amount remains 0 to avoid double-counting.
    v_freight_amount := 0;

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

  -- ── 3. Resolve taxability (material, labor, freight_delivery) ───────
  v_material_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'material');
  v_labor_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'labor');
  v_freight_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'freight_delivery');

  v_taxability_results := jsonb_build_object(
    'material', v_material_taxability,
    'labor', v_labor_taxability,
    'freight_delivery', v_freight_taxability
  );

  IF v_material_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'material', 'reason', v_material_taxability->>'explanation'));
  END IF;

  IF v_labor_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'labor', 'reason', v_labor_taxability->>'explanation'));
  END IF;

  IF v_freight_taxability->>'taxability_status' = 'needs_review' THEN
    v_review_reasons := array_append(v_review_reasons,
      jsonb_build_object('layer', 'taxability', 'classification', 'freight_delivery', 'reason', v_freight_taxability->>'explanation'));
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
    -- Include freight/delivery in taxable subtotal when taxable
    IF v_freight_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_freight_amount;
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
    'tax_rate', v_tax_rate,
    'freight_amount', v_freight_amount,
    'review_reasons', to_jsonb(v_review_reasons),
    'exemption_reference', v_exemption_ref
  );
END;
$function$;
