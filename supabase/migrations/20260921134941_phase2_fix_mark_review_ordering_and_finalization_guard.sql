/*
# Phase 2 Fix: Fix mark_tax_review_required ordering + enforce finalization server-side

## Purpose

### Fix 4: mark_tax_review_required ordering
The current function sets the transaction to review_required FIRST,
then calls calculate_tax which can overwrite the status back to 'ready'.
This leaves the returned result and stored status inconsistent.

Fix: Call calculate_tax FIRST to get the MJV context, THEN perform the
failure mutation LAST so the stored status is always review_required.

### Fix 5: Enforce finalization server-side
Currently finalization (proposal send/approval, change order approval,
invoice send/finalize) is only guarded by frontend buttons. This adds
BEFORE UPDATE triggers that block status transitions to sent/approved/
issued/finalized when tax_calculation_status = 'review_required'.

Allowed for finalization:
- ready (with successful TaxJar result)
- exempt
- not_collecting
- NULL (legacy transactions not yet calculated)

Blocked:
- review_required

## Changes
1. Rewrite mark_tax_review_required function body (failure mutation LAST)
2. Create finalization guard trigger function (shared)
3. Create BEFORE UPDATE triggers on proposals, change_orders, invoices

## Security
- No RLS changes.
- No schema changes.
- Triggers are SECURITY DEFINER so they can read tax_calculation_status.
*/

-- ── Fix 4: Rewrite mark_tax_review_required ────────────────────────────
-- The failure mutation now happens LAST, after calculate_tax runs,
-- so the stored status is always review_required when the function returns.
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
  v_final_status text;
BEGIN
  -- ── 1. Validate transaction exists ────────────────────────────────────
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

  -- ── 2. Get the MJV calculation context FIRST ──────────────────────────
  -- calculate_tax may set the status to 'ready', but we will override
  -- it with the failure mutation below.
  v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);

  -- ── 3. Build the TaxJar failure review reason ─────────────────────────
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

  -- ── 4. Upsert the tax snapshot with failure context ───────────────────
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

  -- ── 5. Perform the failure mutation LAST ──────────────────────────────
  -- This happens after calculate_tax so the stored status is always
  -- review_required when the function returns.
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

  -- ── 6. Verify the transaction row still contains review_required ──────
  IF p_transaction_type = 'proposal' THEN
    SELECT tax_calculation_status INTO v_final_status FROM proposals WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'change_order' THEN
    SELECT tax_calculation_status INTO v_final_status FROM change_orders WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'invoice' THEN
    SELECT tax_calculation_status INTO v_final_status FROM invoices WHERE id = p_transaction_id;
  END IF;

  -- ── 7. Return the failure result ───────────────────────────────────────
  RETURN jsonb_build_object(
    'tax_calculation_status', v_final_status,
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

-- ── Fix 5: Finalization guard triggers ──────────────────────────────────

-- Guard function: blocks finalization when tax_calculation_status = 'review_required'
-- Called as a BEFORE UPDATE trigger on proposals, change_orders, and invoices.
CREATE OR REPLACE FUNCTION public.guard_finalization_tax_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tax_status text;
BEGIN
  -- Read the current tax_calculation_status from the NEW row
  v_tax_status := NEW.tax_calculation_status;

  -- If tax_calculation_status is review_required, block finalization
  -- Finalization statuses: sent, approved, issued, finalized
  IF v_tax_status = 'review_required' THEN
    IF TG_TABLE_NAME = 'proposals' THEN
      IF NEW.status IN ('sent', 'approved') AND COALESCE(OLD.status, '') NOT IN ('sent', 'approved') THEN
        RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before sending or approving.', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF TG_TABLE_NAME = 'change_orders' THEN
      IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
        RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before approving.', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF TG_TABLE_NAME = 'invoices' THEN
      IF NEW.status IN ('sent', 'issued', 'finalized') AND COALESCE(OLD.status, '') NOT IN ('sent', 'issued', 'finalized') THEN
        RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before sending or finalizing.', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create triggers on all three transaction tables
DROP TRIGGER IF EXISTS trigger_guard_finalization_proposals ON proposals;
CREATE TRIGGER trigger_guard_finalization_proposals
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_finalization_tax_check();

DROP TRIGGER IF EXISTS trigger_guard_finalization_change_orders ON change_orders;
CREATE TRIGGER trigger_guard_finalization_change_orders
  BEFORE UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_finalization_tax_check();

DROP TRIGGER IF EXISTS trigger_guard_finalization_invoices ON invoices;
CREATE TRIGGER trigger_guard_finalization_invoices
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_finalization_tax_check();
