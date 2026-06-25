/*
  Fix original_contract_total to use proposal.total (tax-inclusive) instead of the
  value that was accidentally seeded from change_orders.original_contract_amount (a
  running-total field, not the original proposal baseline).

  Also fixes the CO billing-status trigger that used an unsigned total_impact,
  causing negative (credit) COs to be immediately flagged as fully_billed.
*/

-- 1. Correct existing sales orders where original_contract_total doesn't match
--    the linked proposal's tax-inclusive total.
UPDATE sales_orders so
SET original_contract_total = p.total
FROM proposals p
WHERE so.proposal_id = p.id
  AND p.total > 0
  AND ABS(so.original_contract_total - p.total) > 0.01;

-- 2. Update the insert trigger to pull from proposals when available.
CREATE OR REPLACE FUNCTION set_so_original_contract_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.original_contract_total IS NULL OR NEW.original_contract_total = 0 THEN
    IF NEW.proposal_id IS NOT NULL THEN
      SELECT total INTO NEW.original_contract_total
      FROM proposals
      WHERE id = NEW.proposal_id;
    END IF;
    -- Fall back to contract_total only when there is no linked proposal.
    IF NEW.original_contract_total IS NULL OR NEW.original_contract_total = 0 THEN
      NEW.original_contract_total := COALESCE(NEW.contract_total, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Fix the invoice-link trigger that updates CO billing status.
--    The old version computed total_impact = new_contract_total - original_contract_amount
--    (a signed value), then compared v_total_billed >= v_change_order_total.
--    For negative COs, total_impact is negative, so 0 >= -1435 = TRUE — the CO was
--    incorrectly marked fully_billed before any billing occurred.
--    Fix: use ABS() so the comparison works correctly for both positive and negative COs.
CREATE OR REPLACE FUNCTION update_co_billing_status_on_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_change_order record;
  v_total_billed numeric;
  v_change_order_total numeric;
BEGIN
  FOR v_change_order IN
    SELECT DISTINCT co.id,
      ABS(co.new_contract_total - co.original_contract_amount) AS total_impact
    FROM change_orders co
    JOIN invoice_change_order_links icol ON co.id = icol.change_order_id
    WHERE icol.invoice_id = NEW.id
  LOOP
    SELECT COALESCE(SUM(ABS(amount_billed)), 0)
    INTO v_total_billed
    FROM invoice_change_order_links
    WHERE change_order_id = v_change_order.id;

    v_change_order_total := v_change_order.total_impact;

    UPDATE change_orders
    SET
      amount_billed = v_total_billed,
      billing_status = CASE
        WHEN v_total_billed = 0 THEN 'unbilled'
        WHEN v_change_order_total > 0 AND v_total_billed >= v_change_order_total THEN 'fully_billed'
        ELSE 'partially_billed'
      END
    WHERE id = v_change_order.id;
  END LOOP;

  RETURN NEW;
END;
$$;
