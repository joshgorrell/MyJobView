/*
# Fix: Allow cost = 0 for customer-supplied line items

The constraint `proposal_line_items_cost_positive` requires `cost > 0`,
but customer-supplied items legitimately have `cost = 0` (the customer
provides the part at no cost to the company).

Updated constraint: cost must be >= 0, and non-customer-supplied items
must still have cost > 0 (enforced by a separate check).
*/

-- Drop the old constraint
ALTER TABLE proposal_line_items DROP CONSTRAINT IF EXISTS proposal_line_items_cost_positive;

-- Add new constraint: cost >= 0 always, and cost > 0 when NOT customer-supplied
ALTER TABLE proposal_line_items
  ADD CONSTRAINT proposal_line_items_cost_positive
  CHECK (
    cost >= 0
    AND (
      is_customer_supplied = true
      OR cost > 0
    )
  );
