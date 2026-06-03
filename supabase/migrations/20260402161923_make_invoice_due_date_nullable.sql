/*
  # Make invoice due_date nullable

  ## Problem
  Invoice creation was failing because due_date is NOT NULL but the app
  correctly passes null when no payment terms are selected (net_30, etc).
  Due dates are optional — not all invoices have a specific due date.

  ## Changes
  - ALTER invoices.due_date to allow NULL values
*/

ALTER TABLE invoices ALTER COLUMN due_date DROP NOT NULL;
