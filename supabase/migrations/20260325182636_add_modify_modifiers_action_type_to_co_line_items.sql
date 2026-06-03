/*
  # Add modifier adjustments tracking to change order line items

  ## Summary
  Extends the change order line items system to support tracking modifier changes
  (discount %, project management %, etc.) as a distinct action type.

  ## Changes

  ### Modified Tables
  - `change_order_line_items`
    - Drops and recreates the `action_type` check constraint to include `modify_modifiers`
    - Adds `modifier_adjustments` (jsonb) column - stores before/after modifier snapshot:
      ```json
      [
        { "label": "Discount", "field": "discount_percent", "old_value": 5, "new_value": 10 },
        { "label": "Project Management", "field": "project_management_percent", "old_value": 0, "new_value": 8 }
      ]
      ```
    - Adds `modifier_impact` (numeric) - net dollar impact of modifier changes on the CO total

  ## Notes
  - `modify_modifiers` records have no `proposal_line_item_id` (they are CO-level, not item-level)
  - `change_amount` on these records = net dollar impact from all modifier changes combined
  - At most one `modify_modifiers` record per change order (upserted on each modifier edit)
*/

-- 1. Drop old constraint
ALTER TABLE change_order_line_items
  DROP CONSTRAINT IF EXISTS change_order_line_items_action_type_check;

-- 2. Re-add constraint including modify_modifiers
ALTER TABLE change_order_line_items
  ADD CONSTRAINT change_order_line_items_action_type_check
  CHECK (action_type IN ('add', 'remove', 'modify_quantity', 'modify_price', 'modify_labor', 'modify_modifiers'));

-- 3. Add modifier_adjustments JSONB column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_line_items' AND column_name = 'modifier_adjustments'
  ) THEN
    ALTER TABLE change_order_line_items
      ADD COLUMN modifier_adjustments jsonb DEFAULT NULL;
  END IF;
END $$;
