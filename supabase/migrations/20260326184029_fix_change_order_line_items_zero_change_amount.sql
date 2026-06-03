/*
  # Fix Change Order Line Items with Incorrect $0.00 Change Amount

  ## Problem
  Change order line items of type modify_quantity, modify_price, and modify_labor
  sometimes have change_amount = 0 even when the original and new values differ.
  This happened because the original values were captured from the post-edit state
  instead of the pre-edit state.

  ## Fix
  Recalculate change_amount for all modify_* rows where:
  - change_amount = 0
  - original_total or original_labor_total differs from new_total or new_labor_total

  Formula: change_amount = (new_total + new_labor_total) - (original_total + original_labor_total)

  ## Affected Tables
  - change_order_line_items: update change_amount for misrecorded modify rows
*/

UPDATE change_order_line_items
SET change_amount = (
  COALESCE(new_total, 0) + COALESCE(new_labor_total, 0)
) - (
  COALESCE(original_total, 0) + COALESCE(original_labor_total, 0)
)
WHERE
  action_type IN ('modify_quantity', 'modify_price', 'modify_labor')
  AND change_amount = 0
  AND (
    COALESCE(new_total, 0) + COALESCE(new_labor_total, 0)
  ) <> (
    COALESCE(original_total, 0) + COALESCE(original_labor_total, 0)
  );
