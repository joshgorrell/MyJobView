-- Add pm_allocation_percentage to sales_orders table.
-- The migration 20261021125521_dealer_pm_allocation.sql intended to add this
-- column but it was never applied to the live database, causing the Project
-- tab to error with "column sales_orders_1.pm_allocation_percentage does not exist".

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS pm_allocation_percentage numeric
  CHECK (pm_allocation_percentage BETWEEN 0 AND 50);

-- Existing rows stay null; the application code defaults to 5% when null.
