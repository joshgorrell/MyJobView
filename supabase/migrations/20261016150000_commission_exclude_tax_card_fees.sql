-- Use invoice revenue excluding tax and the structured credit-card fee.
-- Fail closed when an invoice's non-tax subtotal or fee source is ambiguous.
CREATE OR REPLACE FUNCTION public.commissionable_invoice_amount(p_invoice public.invoices)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_fee numeric := 0;
  v_snapshot public.tax_snapshots%ROWTYPE;
BEGIN
  IF p_invoice.subtotal IS NULL OR p_invoice.subtotal < 0 THEN
    RAISE EXCEPTION 'Commission basis requires a valid invoice subtotal';
  END IF;
  IF p_invoice.tax_snapshot_id IS NOT NULL THEN
    SELECT * INTO v_snapshot FROM public.tax_snapshots
      WHERE id = p_invoice.tax_snapshot_id
        AND organization_id = p_invoice.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice tax snapshot missing or from another organization';
    END IF;
    v_fee := COALESCE(v_snapshot.credit_card_fee_amount, 0);
  END IF;
  -- Classification is authoritative when invoice line items exist.
  -- Fee line items may be present even when the invoice has no tax snapshot.
  IF EXISTS (
    SELECT 1 FROM public.invoice_line_items li
    WHERE li.invoice_id = p_invoice.id
      AND (lower(coalesce(li.item_type,'')) = 'credit_card_fee'
        OR EXISTS (
          SELECT 1 FROM public.tax_classifications tc
          WHERE tc.id = li.tax_classification_id AND tc.code = 'credit_card_fee'
        ))
  ) THEN
    IF p_invoice.tax_snapshot_id IS NULL THEN
      SELECT COALESCE(SUM(li.amount),0) INTO v_fee
      FROM public.invoice_line_items li
      WHERE li.invoice_id = p_invoice.id
        AND (lower(coalesce(li.item_type,'')) = 'credit_card_fee'
          OR EXISTS (
            SELECT 1 FROM public.tax_classifications tc
            WHERE tc.id = li.tax_classification_id AND tc.code = 'credit_card_fee'
          ));
    END IF;
  END IF;
  IF v_fee < 0 OR v_fee > p_invoice.subtotal THEN
    RAISE EXCEPTION 'Invalid credit card fee in commission basis';
  END IF;
  RETURN p_invoice.subtotal - v_fee;
END;
$$;

-- The existing invoice trigger handles both sales and PM commissions.
-- Replace only its taxable basis expression, retaining role and payment logic.
DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_commission_records_for_invoice()'::regprocedure)
    INTO v_definition;
  IF position('v_basis_amount := NEW.total;' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected commission trigger version; manual review required';
  END IF;
  v_definition := replace(v_definition,
    'v_basis_amount := NEW.total;',
    'v_basis_amount := public.commissionable_invoice_amount(NEW);');
  EXECUTE v_definition;
END $$;
