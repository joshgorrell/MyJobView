/*
  # Fix change_orders.amount_billed stale data

  ## Problem
  When invoices were created via the "Invoice from Change Orders" modal or the
  main "Create Invoice" modal with CO rows selected, the invoice_change_order_links
  records were correctly inserted — but the change_orders.amount_billed and
  billing_status columns were never updated.

  This caused the main "Create Invoice" modal to mis-calculate remaining balances:
  - totalInvoiced correctly counted all invoices (including CO invoices)
  - but amount_billed on each change_order remained 0
  - so the math treated CO invoice amounts as original-contract billing, making
    the full CO amount appear available again

  ## Fix
  This migration recalculates amount_billed and billing_status for every change
  order by summing the amounts from invoice_change_order_links, excluding links
  attached to voided invoices.

  Only change orders whose stored amount_billed differs from the calculated value
  are updated, so this is safe to run repeatedly.
*/

DO $$
DECLARE
  rec RECORD;
  calc_amount NUMERIC;
  co_total NUMERIC;
  new_status TEXT;
BEGIN
  FOR rec IN
    SELECT
      co.id,
      co.change_amount,
      co.tax_amount,
      co.amount_billed AS stored_amount_billed,
      COALESCE(SUM(CASE WHEN inv.status != 'void' THEN icl.amount_billed ELSE 0 END), 0) AS calculated_amount_billed
    FROM change_orders co
    LEFT JOIN invoice_change_order_links icl ON icl.change_order_id = co.id
    LEFT JOIN invoices inv ON inv.id = icl.invoice_id
    GROUP BY co.id, co.change_amount, co.tax_amount, co.amount_billed
    HAVING
      COALESCE(SUM(CASE WHEN inv.status != 'void' THEN icl.amount_billed ELSE 0 END), 0)
      != COALESCE(co.amount_billed, 0)
  LOOP
    calc_amount := rec.calculated_amount_billed;
    co_total := ABS(rec.change_amount) + COALESCE(rec.tax_amount, 0);

    IF calc_amount <= 0 THEN
      new_status := 'unbilled';
    ELSIF co_total > 0 AND calc_amount >= co_total - 0.01 THEN
      new_status := 'fully_billed';
    ELSE
      new_status := 'partially_billed';
    END IF;

    UPDATE change_orders
    SET
      amount_billed = calc_amount,
      billing_status = new_status
    WHERE id = rec.id;
  END LOOP;
END $$;
