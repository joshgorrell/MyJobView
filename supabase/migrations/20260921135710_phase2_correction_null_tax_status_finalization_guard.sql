/*
# Phase 2 Correction: NULL tax status must not bypass finalization

## Purpose
The finalization guard currently allows NULL tax_calculation_status to
pass through. This is not authoritative — no binding transaction should
be finalized without an explicit authoritative tax disposition.

This migration rewrites the guard_finalization_tax_check function to:

1. Block finalization when tax_calculation_status is NULL.
   BUT: before blocking, attempt to run calculate_tax to resolve the
   status. If it resolves to ready/exempt/not_collecting, allow
   finalization. If it resolves to review_required or fails, block.
2. Block finalization when tax_calculation_status is 'review_required'.
3. Block finalization for any unknown/unrecognized status value.
4. Allow finalization only for: ready, exempt, not_collecting.

This applies consistently to:
- Proposal Send (status → sent)
- Proposal Approval (status → approved)
- Change Order Approval (status → approved)
- Invoice Finalization/Send (status → sent/issued/finalized)

## Legacy transactions
Legacy transactions with NULL tax_calculation_status are not made
impossible to work with. When a user attempts a binding action, the
trigger runs calculate_tax first. If it resolves successfully, the
transaction proceeds. If it cannot resolve (e.g., missing jobsite
address, unknown nexus), it is set to review_required and blocked.

## Security
- No RLS changes.
- No schema changes.
- Trigger function is SECURITY DEFINER so it can call calculate_tax.
*/

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

  -- Only check during finalization transitions
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

  -- For NULL or any unrecognized status: attempt to resolve via calculate_tax
  -- This handles legacy transactions that were never calculated
  IF v_tax_status IS NULL OR v_tax_status NOT IN ('ready', 'exempt', 'not_collecting', 'review_required') THEN
    BEGIN
      v_calc_result := calculate_tax(v_transaction_type, v_transaction_id);
      v_resolved_status := v_calc_result->>'tax_calculation_status';
    EXCEPTION WHEN OTHERS THEN
      -- Calculation failed — block finalization
      RAISE EXCEPTION 'Cannot finalize %: tax calculation could not be resolved. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END;

    -- Check the resolved status
    IF v_resolved_status IN ('ready', 'exempt', 'not_collecting') THEN
      -- Calculation resolved successfully — update the NEW row so the
      -- finalization proceeds with the correct tax status and amount
      NEW.tax_calculation_status := v_resolved_status;
      NEW.tax_review_required := false;
      NEW.tax_amount := COALESCE((v_calc_result->>'tax_amount')::numeric, 0);
      RETURN NEW;
    ELSIF v_resolved_status = 'review_required' THEN
      -- Calculation resolved but requires review — block
      RAISE EXCEPTION 'Cannot finalize %: tax calculation requires review. Please resolve tax review issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    ELSE
      -- Unknown resolved status — block
      RAISE EXCEPTION 'Cannot finalize %: tax calculation returned an unrecognized status. Please run tax calculation and resolve any issues before finalizing.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Fallback: block anything we didn't explicitly allow
  RAISE EXCEPTION 'Cannot finalize %: tax calculation status must be resolved before finalizing.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$function$;
