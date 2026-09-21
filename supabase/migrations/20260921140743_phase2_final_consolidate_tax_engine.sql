/*
# Phase 2 Final: Consolidate to one MJV tax decision engine

## Purpose
calculate_tax and calculate_tax_readonly duplicate the entire MJV tax
decision logic. This migration eliminates the duplication by extracting
the shared core into calculate_tax_context — a read-only function that
performs the single authoritative calculation and returns the complete
context. calculate_tax becomes a thin wrapper that adds authorization,
calls calculate_tax_context, persists the result, and returns it.
calculate_tax_readonly is replaced with a trivial wrapper.

## calculate_tax_context (NEW — the single engine)
- READ ONLY: does not update any transaction row
- No authorization check (internal helper, service_role only)
- Contains ALL tax decision logic:
  load transaction, resolve org/env/project_type, calculate amounts,
  resolve taxability, origin, destination, nexus, exemption,
  determine status, return context

## calculate_tax (rewritten as thin wrapper)
- Retains caller authorization (auth.uid() org check)
- Calls calculate_tax_context
- Persists status to the transaction row
- Returns the result

## calculate_tax_readonly (replaced with trivial wrapper)
- Simply calls calculate_tax_context and returns the result
- Kept only if anything still references the name

## guard_finalization_tax_check (updated)
- Calls calculate_tax_context instead of calculate_tax_readonly

## Security
- calculate_tax_context: service_role only (no PUBLIC/anon/authenticated)
- calculate_tax: authenticated (with org auth check inside)
- calculate_tax_readonly: service_role only (trivial wrapper)
*/

-- ── 1. Create calculate_tax_context — the single MJV decision engine ──
CREATE OR REPLACE FUNCTION public.calculate_tax_context(
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

  v_freight_sc_id uuid;
  v_cm1_sc_id uuid;
  v_cm2_sc_id uuid;
  v_cm1_amount numeric;
  v_cm2_amount numeric;
  v_cm1_apply boolean;
  v_cm2_apply boolean;
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

    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(item_type, 'part') != 'labor' AND COALESCE(is_customer_supplied, false) = false THEN line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN item_type = 'labor' THEN COALESCE(labor_total, line_total) ELSE COALESCE(labor_total, 0) END), 0)
    INTO v_material_amount, v_labor_amount
    FROM proposal_line_items WHERE proposal_id = p_transaction_id;

    -- Resolve freight/delivery from custom modifiers via proposal_settings
    SELECT scc.id INTO v_freight_sc_id
    FROM special_charge_classifications scc
    WHERE scc.code = 'freight_delivery';

    SELECT ps.custom_modifier_1_special_charge_id,
           ps.custom_modifier_2_special_charge_id
    INTO v_cm1_sc_id, v_cm2_sc_id
    FROM proposal_settings ps
    WHERE ps.proposal_id = p_transaction_id;

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

    SELECT p.office_id, p.contact_id, p.jobsite_address, p.jobsite_city, p.jobsite_state, p.jobsite_zip
    INTO v_office_id, v_contact_id, v_jobsite_street, v_jobsite_city, v_jobsite_state, v_jobsite_zip
    FROM proposals p
    JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

    SELECT COALESCE(SUM(change_amount), 0) INTO v_material_amount
    FROM change_order_line_items
    WHERE change_order_id = p_transaction_id AND action_type <> 'modify_modifiers';

    v_labor_amount := 0;

    -- Resolve freight/delivery from change order modifiers
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

    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(item_type, 'part') != 'labor' THEN line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN item_type = 'labor' THEN line_total ELSE 0 END), 0)
    INTO v_material_amount, v_labor_amount
    FROM invoice_line_items WHERE invoice_id = p_transaction_id;

    -- Invoices: freight is already in line items, no separate modifier
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

    IF v_material_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_material_amount;
    END IF;
    IF v_labor_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_labor_amount;
    END IF;
    IF v_freight_taxability->>'taxability_status' = 'taxable' THEN
      v_taxable_subtotal := v_taxable_subtotal + v_freight_amount;
    END IF;

    v_tax_amount := round(v_taxable_subtotal * v_tax_rate, 2);
  END IF;

  -- ── 8. Return the complete context (READ ONLY — no transaction update) ─
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

-- Lock down: service_role only
REVOKE EXECUTE ON FUNCTION public.calculate_tax_context(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_tax_context(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_tax_context(text, uuid) FROM authenticated;

-- ── 2. Rewrite calculate_tax as a thin wrapper ────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_tax(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_org_id uuid;
  v_txn_org_id uuid;
  v_context jsonb;
  v_status text;
  v_tax_amount numeric;
BEGIN
  -- ── 1. Caller authorization ───────────────────────────────────────────
  -- When called by an authenticated user (not the service role), verify
  -- the user belongs to the transaction's organization.
  v_caller_org_id := auth.uid();
  IF v_caller_org_id IS NOT NULL THEN
    IF p_transaction_type = 'proposal' THEN
      SELECT organization_id INTO v_txn_org_id FROM proposals WHERE id = p_transaction_id;
    ELSIF p_transaction_type = 'change_order' THEN
      SELECT organization_id INTO v_txn_org_id FROM change_orders WHERE id = p_transaction_id;
    ELSIF p_transaction_type = 'invoice' THEN
      SELECT organization_id INTO v_txn_org_id FROM invoices WHERE id = p_transaction_id;
    ELSE
      RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
    END IF;

    IF v_txn_org_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Transaction not found');
    END IF;

    SELECT p.organization_id INTO v_caller_org_id
    FROM profiles p WHERE p.id = v_caller_org_id;

    IF v_caller_org_id IS NULL OR v_caller_org_id <> v_txn_org_id THEN
      RETURN jsonb_build_object('error', 'You do not have access to this transaction');
    END IF;
  END IF;

  -- ── 2. Call the single authoritative calculation engine ──────────────
  v_context := calculate_tax_context(p_transaction_type, p_transaction_id);

  -- If the engine returned an error, pass it through
  IF v_context ? 'error' THEN
    RETURN v_context;
  END IF;

  -- ── 3. Persist the status to the transaction row ─────────────────────
  v_status := v_context->>'tax_calculation_status';
  v_tax_amount := COALESCE((v_context->>'tax_amount')::numeric, 0);

  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET
      tax_review_required = (v_status = 'review_required'),
      tax_calculation_status = v_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;

  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET
      tax_review_required = (v_status = 'review_required'),
      tax_calculation_status = v_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;

  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET
      tax_review_required = (v_status = 'review_required'),
      tax_calculation_status = v_status,
      tax_amount = v_tax_amount
    WHERE id = p_transaction_id;
  END IF;

  -- ── 4. Return the result ──────────────────────────────────────────────
  RETURN v_context;
END;
$function$;

-- Keep calculate_tax grants: authenticated only (with org auth check)
REVOKE EXECUTE ON FUNCTION public.calculate_tax(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_tax(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_tax(text, uuid) TO authenticated;

-- ── 3. Replace calculate_tax_readonly with trivial wrapper ────────────
CREATE OR REPLACE FUNCTION public.calculate_tax_readonly(
  p_transaction_type text,
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN calculate_tax_context(p_transaction_type, p_transaction_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.calculate_tax_readonly(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_tax_readonly(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_tax_readonly(text, uuid) FROM authenticated;

-- ── 4. Update finalization guard to call calculate_tax_context ────────
CREATE OR REPLACE FUNCTION public.guard_finalization_tax_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tax_status text;
  v_is_finalizing boolean := false;
  v_calc_result jsonb;
  v_resolved_status text;
  v_transaction_type text;
  v_transaction_id uuid;
BEGIN
  -- Determine if this UPDATE is a finalization transition
  IF TG_TABLE_NAME = 'proposals' THEN
    IF NEW.status IN ('sent', 'approved') AND COALESCE(OLD.status, '') NOT IN ('sent', 'approved') THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'proposal';
    v_transaction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'change_orders' THEN
    IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'change_order';
    v_transaction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status IN ('sent', 'issued', 'finalized') AND COALESCE(OLD.status, '') NOT IN ('sent', 'issued', 'finalized') THEN
      v_is_finalizing := true;
    END IF;
    v_transaction_type := 'invoice';
    v_transaction_id := NEW.id;
  END IF;

  IF NOT v_is_finalizing THEN
    RETURN NEW;
  END IF;

  v_tax_status := NEW.tax_calculation_status;

  -- Allow finalization for explicit authoritative dispositions
  IF v_tax_status IN ('ready', 'exempt', 'not_collecting') THEN
    RETURN NEW;
  END IF;

  -- Block immediately for review_required
  IF v_tax_status = 'review_required' THEN
    RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  -- For NULL or unrecognized status: resolve via the single engine
  IF v_tax_status IS NULL OR v_tax_status NOT IN ('ready', 'exempt', 'not_collecting', 'review_required') THEN
    BEGIN
      v_calc_result := calculate_tax_context(v_transaction_type, v_transaction_id);
      v_resolved_status := v_calc_result->>'tax_calculation_status';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Cannot finalize %: tax calculation could not be resolved. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END;

    IF v_resolved_status IN ('ready', 'exempt', 'not_collecting') THEN
      NEW.tax_calculation_status := v_resolved_status;
      NEW.tax_review_required := false;
      NEW.tax_amount := COALESCE((v_calc_result->>'tax_amount')::numeric, 0);
      RETURN NEW;
    ELSIF v_resolved_status = 'review_required' THEN
      RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Cannot finalize %: tax calculation returned an unrecognized status. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RAISE EXCEPTION 'Cannot finalize %: tax calculation status must be resolved before finalizing.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$function$;
