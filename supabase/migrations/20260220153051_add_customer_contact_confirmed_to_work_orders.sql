/*
  # Add Customer Contact Confirmation Tracking to Work Orders

  ## Summary
  Adds a timestamp field to work_orders to track when dispatch staff contacted
  the customer to verify/confirm their work order appointment. This enables
  the Service Request Response Time Analytics dashboard to calculate:
  - Time from work order creation to customer contact confirmation

  ## Changes

  ### Modified Tables
  - `work_orders`
    - Added `customer_contact_confirmed_at` (timestamptz, nullable) - timestamp when
      dispatch confirmed the appointment with the customer
    - Added `customer_contact_confirmed_by` (uuid, nullable) - which staff member
      made the confirmation call/contact

  ## Notes
  - Both fields are nullable since historical records will not have this data
  - Field will be populated going forward when dispatch marks a WO as customer-confirmed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'customer_contact_confirmed_at'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN customer_contact_confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'customer_contact_confirmed_by'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN customer_contact_confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_customer_contact_confirmed_at
  ON work_orders(customer_contact_confirmed_at)
  WHERE customer_contact_confirmed_at IS NOT NULL;
