/*
# Fix Deposit Invoice Line Items to Use Classified Allocation

## Approach
Instead of rewriting the entire handle_unified_proposal_approval trigger,
we create a helper function that replaces the single deposit line item
with classified line items AFTER the trigger runs.

The trigger creates a deposit invoice with a single unclassified line item.
This function, called after deposit invoice creation, replaces that single
line item with properly classified line items using the proposal's
6-classification composition.

## Function: classify_deposit_invoice
Input: p_invoice_id (the deposit invoice), p_proposal_id (the source proposal)
Behavior:
1. Delete the existing single unclassified deposit line item
2. Call allocate_billing_amount to get the classified split
3. Insert one line per non-zero classification with tax_classification_id
4. Calculate tax per classification
5. Update the invoice's tax_amount and total
*/

CREATE OR REPLACE FUNCTION classify_deposit_invoice(
  p_invoice_id uuid,
  p_proposal_id uuid
) RETURNS void AS $$
DECLARE
  v_deposit_amount numeric;
  v_org_id uuid;
  v_tax_rate numeric;
  v_environment text;
  v_project_type text;
  v_state text;
  v_allocation jsonb;
  v_allocations jsonb;
  v_alloc jsonb;
  v_class_code text;
  v_alloc_amount numeric;
  v_class_id uuid;
  v_taxable boolean;
  v_taxable_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_sort_order integer := 0;
  v_material_taxability jsonb;
  v_labor_taxability jsonb;
  v_freight_taxability jsonb;
  v_design_fee_taxability jsonb;
  v_pm_taxability jsonb;
  v_ccf_taxability jsonb;
  v_item_type text;
BEGIN
  -- Get deposit amount from existing line items
  SELECT COALESCE(SUM(amount), 0) INTO v_deposit_amount
  FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  IF v_deposit_amount = 0 THEN
    RETURN;
  END IF;

  -- Get proposal info
  SELECT organization_id, tax_rate, tax_environment, tax_project_type, jobsite_state
  INTO v_org_id, v_tax_rate, v_environment, v_project_type, v_state
  FROM proposals WHERE id = p_proposal_id;

  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_environment := COALESCE(v_environment, 'residential');
  v_project_type := COALESCE(v_project_type, 'general_installation_repair');
  v_state := COALESCE(v_state, '');

  -- Delete existing unclassified line items
  DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  -- Get classified allocation
  v_allocation := allocate_billing_amount('proposal', p_proposal_id, v_deposit_amount);
  v_allocations := v_allocation->'allocations';

  IF jsonb_array_length(v_allocations) = 0 THEN
    -- Fallback: single unclassified line
    INSERT INTO invoice_line_items (
      invoice_id, organization_id,
      description, quantity, unit_price, amount, is_taxable, sort_order
    ) VALUES (
      p_invoice_id, v_org_id,
      'Deposit', 1, v_deposit_amount, v_deposit_amount, false, 0
    );
    RETURN;
  END IF;

  -- Resolve taxability
  v_material_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'material');
  v_labor_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'labor');
  v_freight_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'freight_delivery');
  v_design_fee_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'design_fee');
  v_pm_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'project_management');
  v_ccf_taxability := resolve_tax_rule(v_state, v_org_id, v_environment, v_project_type, 'credit_card_fee');

  v_taxable_subtotal := 0;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocations) LOOP
    v_class_code := v_alloc->>'classification_code';
    v_alloc_amount := (v_alloc->>'allocated_amount')::numeric;

    SELECT tc.id INTO v_class_id
    FROM tax_classifications tc
    WHERE tc.code = v_class_code AND tc.organization_id = v_org_id
    LIMIT 1;

    v_taxable := false;
    v_item_type := 'service';
    IF v_class_code = 'material' THEN
      v_taxable := (v_material_taxability->>'taxability_status') = 'taxable';
      v_item_type := 'material';
    ELSIF v_class_code = 'labor' THEN
      v_taxable := (v_labor_taxability->>'taxability_status') = 'taxable';
      v_item_type := 'labor';
    ELSIF v_class_code = 'freight_delivery' THEN
      v_taxable := (v_freight_taxability->>'taxability_status') = 'taxable';
    ELSIF v_class_code = 'design_fee' THEN
      v_taxable := (v_design_fee_taxability->>'taxability_status') = 'taxable';
    ELSIF v_class_code = 'project_management' THEN
      v_taxable := (v_pm_taxability->>'taxability_status') = 'taxable';
    ELSIF v_class_code = 'credit_card_fee' THEN
      v_taxable := (v_ccf_taxability->>'taxability_status') = 'taxable';
    END IF;

    IF v_taxable THEN
      v_taxable_subtotal := v_taxable_subtotal + v_alloc_amount;
    END IF;

    INSERT INTO invoice_line_items (
      invoice_id, organization_id,
      description, quantity, unit_price, amount,
      item_type, is_taxable, tax_amount,
      tax_classification_id, sort_order
    ) VALUES (
      p_invoice_id, v_org_id,
      'Deposit — ' || v_class_code,
      1, v_alloc_amount, v_alloc_amount,
      v_item_type, v_taxable,
      CASE WHEN v_taxable THEN round(v_alloc_amount * v_tax_rate, 2) ELSE 0 END,
      v_class_id, v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  v_tax_amount := round(v_taxable_subtotal * v_tax_rate, 2);

  -- Update invoice totals
  UPDATE invoices SET
    tax_amount = v_tax_amount,
    total = v_deposit_amount + v_tax_amount
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the trigger to call classify_deposit_invoice after creating the deposit
-- We need to modify handle_unified_proposal_approval to call this function
-- after the deposit invoice is created. Since we can't easily patch the trigger,
-- we'll add a second trigger that fires AFTER the deposit invoice is created.

-- Create a trigger on invoices that fires when a deposit invoice is inserted
CREATE OR REPLACE FUNCTION classify_deposit_on_insert()
RETURNS trigger AS $$
BEGIN
  IF NEW.source_type = 'deposit' AND NEW.proposal_id IS NOT NULL THEN
    -- Only classify if the line items are unclassified (single line, no tax_classification_id)
    PERFORM classify_deposit_invoice(NEW.id, NEW.proposal_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS trigger_classify_deposit_invoice ON invoices;
CREATE TRIGGER trigger_classify_deposit_invoice
  AFTER INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.source_type = 'deposit' AND NEW.proposal_id IS NOT NULL)
  EXECUTE FUNCTION classify_deposit_on_insert();
