/*
  # Fix Sales Orders Status Constraint

  ## Problem
  The `sales_orders` table only allows statuses: 'planning', 'active', 'complete', 'closed'.
  However, the proposal approval trigger inserts sales orders with status = 'pending_deposit'
  when a deposit is required before work begins. This constraint violation silently prevents
  any sales order from being created when a proposal is approved.

  ## Changes
  1. Drop the old status CHECK constraint on `sales_orders`
  2. Add a new constraint that includes 'pending_deposit' and 'pending_po' statuses
  3. Re-run the unified approval trigger function to ensure it can fire correctly

  ## New Status Values
  - pending_deposit: Proposal approved, waiting for deposit payment before proceeding
  - pending_po: Proposal approved via PO, waiting for purchase order
  - planning: Active sales order in planning phase
  - active: Work in progress
  - complete: Work completed
  - closed: Sales order closed
*/

ALTER TABLE sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_status_check;

ALTER TABLE sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('pending_deposit', 'pending_po', 'planning', 'active', 'complete', 'closed'));
