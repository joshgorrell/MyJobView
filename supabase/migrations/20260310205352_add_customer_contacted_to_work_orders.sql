/*
  # Add customer_contacted flag to work_orders

  ## Summary
  Adds a boolean field to track whether the customer was confirmed as contacted
  at the time the work order was created. This addresses the operational issue
  where technicians arrive at customer locations that were never notified.

  ## Changes
  - `work_orders` table:
    - `customer_contacted` (boolean, default false) — set to true at creation
      time when the creator confirms the customer is aware of the visit

  ## Notes
  - Existing records default to false (unknown contact status)
  - The create work order modal will require this checkbox to be checked before saving
  - Distinct from `customer_contact_confirmed_at` which records post-assignment contact logging
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'customer_contacted'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN customer_contacted boolean NOT NULL DEFAULT false;
  END IF;
END $$;
