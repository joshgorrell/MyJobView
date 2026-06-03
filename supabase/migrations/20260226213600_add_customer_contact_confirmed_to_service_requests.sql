/*
  # Add Customer Contact Confirmation to Service Requests

  ## Summary
  Adds contact confirmation tracking directly to the service_requests table,
  mirroring the same fields that already exist on work_orders. This allows
  dispatch to mark a customer as contacted even before a service request has
  been converted to a work order, and allows sales reps to see the confirmation
  status for all their submitted service requests.

  ## Changes

  ### Modified Tables
  - `service_requests`
    - `customer_contact_confirmed_at` (timestamptz, nullable) - timestamp when dispatch confirmed customer contact
    - `customer_contact_confirmed_by` (uuid, nullable, FK to profiles) - who made the confirmation

  ## Security
  - No RLS changes needed; existing service_requests RLS policies cover these columns

  ## Notes
  - Mirrors the pattern already used on work_orders (customer_contact_confirmed_at / _by)
  - Partial index added for query performance when filtering confirmed records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_requests' AND column_name = 'customer_contact_confirmed_at'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN customer_contact_confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_requests' AND column_name = 'customer_contact_confirmed_by'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN customer_contact_confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_requests_customer_contact_confirmed_at
  ON service_requests(customer_contact_confirmed_at)
  WHERE customer_contact_confirmed_at IS NOT NULL;
