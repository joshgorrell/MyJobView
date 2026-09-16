/*
# Phase 2: Create persist_taxjar_result and mark_tax_review_required functions

## Purpose
Two new SECURITY DEFINER functions that the TaxJar Edge Function calls to
persist authoritative TaxJar results or failure states.

## 1. persist_taxjar_result

Called when TaxJar /v2/taxes returns a valid result. Persists the
authoritative tax amount, rate, and jurisdiction breakdown to the
transaction record and tax snapshot.

### Parameters
- p_transaction_type: 'proposal' | 'change_order' | 'invoice'
- p_transaction_id: UUID of the transaction
- p_taxjar_result: The `tax` object from TaxJar's /v2/taxes response

### What it does
1. Verifies the transaction exists.
2. Updates the transaction record with authoritative TaxJar values:
   - tax_amount = TaxJar's amount_to_collect
   - tax_rate = TaxJar's rate
   - tax_calculation_status = 'ready'
   - tax_review_required = false
3. Calls calculate_tax to get the full MJV context (origin, destination,
   taxability, etc.) so the snapshot has the complete picture.
4. Upserts the tax snapshot with all MJV + TaxJar fields.
5. Returns the completed result JSON for the Edge Function.

## 2. mark_tax_review_required

Called when TaxJar fails (API key missing, auth failure, timeout, invalid
response, etc.). Sets the transaction to review_required with the specific
failure reason.

### Parameters
- p_transaction_type: 'proposal' | 'change_order' | 'invoice'
- p_transaction_id: UUID of the transaction
- p_failure_reason: Human-readable failure reason

### What it does
1. Updates the transaction's tax_calculation_status = 'review_required',
   tax_review_required = true, tax_amount = 0.
2. Calls calculate_tax to get the MJV context.
3. Writes/updates the tax snapshot with the failure reason in review_reasons.
4. Returns a JSON object with the failure details.

## Security
- Both functions are SECURITY DEFINER with search_path = 'public'
- No RLS changes
- No schema changes (only functions)
- The functions do NOT accept any client-supplied tax amounts, rates, or
  addresses -- only the transaction ID and either the TaxJar response
  object or a failure reason string
*/

-- ── 1. persist_taxjar_result ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.persist_taxjar_result(
  p_transaction_type text,
  p_transaction_id uuid,
  p_taxjar_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean := false;
  v_org_id uuid;
  v_calc_result jsonb;
  v_snapshot_id uuid;
  v_amount_to_collect numeric;
  v_rate numeric;
  v_tax_source text;
  v_freight_taxable boolean;
  v_breakdown jsonb;
  v_state_rate numeric := 0;
  v_county_rate numeric := 0;
  v_city_rate numeric := 0;
  v_district_rate numeric := 0;
  v_combined_rate numeric := 0;
  v_jurisdiction_name text;
BEGIN
  -- ── Validate transaction exists ────────────────────────────────────
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id INTO v_org_id FROM proposals WHERE id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id INTO v_org_id FROM change_orders co WHERE co.id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSIF p_transaction_type = 'invoice' THEN
    SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSE
    RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
  END IF;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('error', 'Transaction not found: ' || p_transaction_type || ' ' || p_transaction_id);
  END IF;

  -- ── Extract TaxJar result fields ───────────────────────────────────
  v_amount_to_collect := COALESCE((p_taxjar_result->>'amount_to_collect')::numeric, 0);
  v_rate := COALESCE((p_taxjar_result->>'rate')::numeric, 0);
  v_tax_source := p_taxjar_result->>'tax_source';
  v_freight_taxable := COALESCE((p_taxjar_result->>'freight_taxable')::boolean, false);
  v_breakdown := p_taxjar_result->'breakdown';

  -- Extract rate components from breakdown if available
  IF v_breakdown IS NOT NULL THEN
    v_state_rate := COALESCE((v_breakdown->'state'->>'state_rate')::numeric, 0);
    v_county_rate := COALESCE((v_breakdown->'county'->>'county_rate')::numeric, 0);
    v_city_rate := COALESCE((v_breakdown->'city'->>'city_rate')::numeric, 0);
    v_district_rate := COALESCE((v_breakdown->'special'->>'special_rate')::numeric, 0);
    v_combined_rate := v_rate;
    -- Build jurisdiction name from breakdown
    SELECT COALESCE(string_agg(COALESCE(part, ''), ', '), '') INTO v_jurisdiction_name
    FROM (
      SELECT v_breakdown->'state'->>'state_abbrev' AS part
      UNION ALL
      SELECT v_breakdown->'county'->>'county_name'
      UNION ALL
      SELECT v_breakdown->'city'->>'city_name'
    ) parts
    WHERE part IS NOT NULL AND part <> '';
  ELSE
    v_combined_rate := v_rate;
  END IF;

  -- ── Update the transaction record with authoritative TaxJar values ─
  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET
      tax_amount = v_amount_to_collect,
      tax_rate = v_rate,
      tax_calculation_status = 'ready',
      tax_review_required = false
    WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET
      tax_amount = v_amount_to_collect,
      tax_rate = v_rate,
      tax_calculation_status = 'ready',
      tax_review_required = false
    WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET
      tax_amount = v_amount_to_collect,
      tax_rate = v_rate,
      tax_calculation_status = 'ready',
      tax_review_required = false
    WHERE id = p_transaction_id;
  END IF;

  -- ── Get the full MJV calculation context for the snapshot ──────────
  v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);

  -- ── Upsert the tax snapshot ────────────────────────────────────────
  -- Check if a snapshot already exists for this transaction
  SELECT id INTO v_snapshot_id
  FROM tax_snapshots
  WHERE transaction_type = p_transaction_type
    AND transaction_id = p_transaction_id
  ORDER BY calculated_at DESC
  LIMIT 1;

  IF v_snapshot_id IS NOT NULL THEN
    -- Update existing snapshot with TaxJar results
    UPDATE tax_snapshots SET
      tax_calculation_status = 'ready',
      sales_tax = v_amount_to_collect,
      combined_rate = v_combined_rate,
      state_rate = v_state_rate,
      county_rate = v_county_rate,
      city_rate = v_city_rate,
      district_rate = v_district_rate,
      tax_source = v_tax_source,
      freight_taxable = v_freight_taxable,
      jurisdiction_breakdown = v_breakdown,
      taxjar_verified_at = now(),
      taxability_results = v_calc_result->'taxability_results',
      origin_address = v_calc_result->'origin_result',
      destination_address = v_calc_result->'destination_result',
      collection_status = v_calc_result->>'collection_status',
      exemption_reference = v_calc_result->>'exemption_reference',
      taxable_subtotal = COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
      calculated_at = now()
    WHERE id = v_snapshot_id;
  ELSE
    -- Insert new snapshot with TaxJar results
    INSERT INTO tax_snapshots (
      organization_id,
      transaction_type,
      transaction_id,
      state,
      environment,
      project_type,
      tax_calculation_status,
      taxability_results,
      origin_method,
      origin_address,
      destination_address,
      collection_status,
      nexus_result,
      exemption_reference,
      taxable_subtotal,
      sales_tax,
      combined_rate,
      state_rate,
      county_rate,
      city_rate,
      district_rate,
      tax_source,
      freight_taxable,
      jurisdiction_breakdown,
      taxjar_verified_at,
      calculated_at
    ) VALUES (
      v_org_id,
      p_transaction_type,
      p_transaction_id,
      COALESCE(v_calc_result->'destination_result'->>'state', ''),
      NULL,
      NULL,
      'ready',
      v_calc_result->'taxability_results',
      v_calc_result->'origin_result'->>'origin_method',
      v_calc_result->'origin_result',
      v_calc_result->'destination_result',
      v_calc_result->>'collection_status',
      v_calc_result->>'collection_status',
      v_calc_result->>'exemption_reference',
      COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
      v_amount_to_collect,
      v_combined_rate,
      v_state_rate,
      v_county_rate,
      v_city_rate,
      v_district_rate,
      v_tax_source,
      v_freight_taxable,
      v_breakdown,
      now(),
      now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_snapshot_id;

    -- Link the snapshot to the transaction
    IF v_snapshot_id IS NOT NULL THEN
      IF p_transaction_type = 'proposal' THEN
        UPDATE proposals SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      ELSIF p_transaction_type = 'change_order' THEN
        UPDATE change_orders SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      ELSIF p_transaction_type = 'invoice' THEN
        UPDATE invoices SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      END IF;
    END IF;
  END IF;

  -- ── Return the completed result ───────────────────────────────────
  RETURN jsonb_build_object(
    'tax_calculation_status', 'ready',
    'taxability_results', v_calc_result->'taxability_results',
    'origin_result', v_calc_result->'origin_result',
    'collection_status', v_calc_result->>'collection_status',
    'destination_result', v_calc_result->'destination_result',
    'tax_amount', v_amount_to_collect,
    'taxable_subtotal', COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
    'tax_rate', v_rate,
    'tax_source', v_tax_source,
    'freight_taxable', v_freight_taxable,
    'jurisdiction_breakdown', v_breakdown,
    'review_reasons', v_calc_result->'review_reasons',
    'exemption_reference', v_calc_result->>'exemption_reference',
    'taxjar_verified_at', to_jsonb(now()),
    'source', 'taxjar'
  );
END;
$function$;

-- ── 2. mark_tax_review_required ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_tax_review_required(
  p_transaction_type text,
  p_transaction_id uuid,
  p_failure_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean := false;
  v_org_id uuid;
  v_calc_result jsonb;
  v_snapshot_id uuid;
  v_existing_reasons jsonb;
  v_new_reason jsonb;
BEGIN
  -- ── Validate transaction exists ────────────────────────────────────
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id INTO v_org_id FROM proposals WHERE id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id INTO v_org_id FROM change_orders co WHERE co.id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSIF p_transaction_type = 'invoice' THEN
    SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_transaction_id;
    v_exists := v_org_id IS NOT NULL;
  ELSE
    RETURN jsonb_build_object('error', 'Unknown transaction type: ' || p_transaction_type);
  END IF;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('error', 'Transaction not found: ' || p_transaction_type || ' ' || p_transaction_id);
  END IF;

  -- ── Update the transaction record ──────────────────────────────────
  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = 0
    WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = 0
    WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET
      tax_calculation_status = 'review_required',
      tax_review_required = true,
      tax_amount = 0
    WHERE id = p_transaction_id;
  END IF;

  -- ── Get the MJV calculation context ────────────────────────────────
  v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);

  -- ── Build the TaxJar failure review reason ─────────────────────────
  v_new_reason := jsonb_build_object(
    'layer', 'taxjar',
    'reason', p_failure_reason
  );

  -- Merge with existing review reasons from calculate_tax
  v_existing_reasons := v_calc_result->'review_reasons';
  IF v_existing_reasons IS NULL THEN
    v_existing_reasons := '[]'::jsonb;
  END IF;
  v_existing_reasons := v_existing_reasons || jsonb_build_array(v_new_reason);

  -- ── Upsert the tax snapshot ────────────────────────────────────────
  SELECT id INTO v_snapshot_id
  FROM tax_snapshots
  WHERE transaction_type = p_transaction_type
    AND transaction_id = p_transaction_id
  ORDER BY calculated_at DESC
  LIMIT 1;

  IF v_snapshot_id IS NOT NULL THEN
    UPDATE tax_snapshots SET
      tax_calculation_status = 'review_required',
      taxability_results = v_calc_result->'taxability_results',
      origin_address = v_calc_result->'origin_result',
      destination_address = v_calc_result->'destination_result',
      collection_status = v_calc_result->>'collection_status',
      exemption_reference = v_calc_result->>'exemption_reference',
      taxable_subtotal = COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
      sales_tax = 0,
      calculated_at = now()
    WHERE id = v_snapshot_id;
  ELSE
    INSERT INTO tax_snapshots (
      organization_id,
      transaction_type,
      transaction_id,
      state,
      tax_calculation_status,
      taxability_results,
      origin_method,
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
      COALESCE(v_calc_result->'destination_result'->>'state', ''),
      'review_required',
      v_calc_result->'taxability_results',
      v_calc_result->'origin_result'->>'origin_method',
      v_calc_result->'origin_result',
      v_calc_result->'destination_result',
      v_calc_result->>'collection_status',
      v_calc_result->>'collection_status',
      v_calc_result->>'exemption_reference',
      COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
      0,
      now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_snapshot_id;

    IF v_snapshot_id IS NOT NULL THEN
      IF p_transaction_type = 'proposal' THEN
        UPDATE proposals SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      ELSIF p_transaction_type = 'change_order' THEN
        UPDATE change_orders SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      ELSIF p_transaction_type = 'invoice' THEN
        UPDATE invoices SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
      END IF;
    END IF;
  END IF;

  -- ── Return the failure result ───────────────────────────────────────
  RETURN jsonb_build_object(
    'tax_calculation_status', 'review_required',
    'taxability_results', v_calc_result->'taxability_results',
    'origin_result', v_calc_result->'origin_result',
    'collection_status', v_calc_result->>'collection_status',
    'destination_result', v_calc_result->'destination_result',
    'tax_amount', 0,
    'taxable_subtotal', COALESCE((v_calc_result->>'taxable_subtotal')::numeric, 0),
    'review_reasons', v_existing_reasons,
    'exemption_reference', v_calc_result->>'exemption_reference',
    'taxjar_error', p_failure_reason,
    'source', 'taxjar_failure'
  );
END;
$function$;