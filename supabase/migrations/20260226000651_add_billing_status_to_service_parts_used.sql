/*
  # Add billing_status to service_parts_used

  ## Summary
  Adds billing disposition tracking to the service_parts_used table so project
  managers can decide what to do with parts added on-site by technicians during
  work orders.

  ## Changes
  ### Modified Tables
  - `service_parts_used`
    - `billing_status` (text) — disposition of the part: 'pending' (not yet decided),
      'billed' (added to a change order for billing), 'absorbed' (kept at our cost,
      not billed to customer). Defaults to 'pending'.
    - `billed_change_order_id` (uuid, nullable) — FK to change_orders.id when
      billing_status = 'billed'. Tracks which CO this part was added to.
    - `absorbed_reason` (text, nullable) — optional note explaining why the part
      was absorbed rather than billed.

  ## Security
  - No new RLS changes needed; existing policies on service_parts_used apply.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_parts_used' AND column_name = 'billing_status'
  ) THEN
    ALTER TABLE service_parts_used
      ADD COLUMN billing_status text NOT NULL DEFAULT 'pending'
        CHECK (billing_status IN ('pending', 'billed', 'absorbed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_parts_used' AND column_name = 'billed_change_order_id'
  ) THEN
    ALTER TABLE service_parts_used
      ADD COLUMN billed_change_order_id uuid REFERENCES change_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_parts_used' AND column_name = 'absorbed_reason'
  ) THEN
    ALTER TABLE service_parts_used
      ADD COLUMN absorbed_reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_parts_used_billing_status
  ON service_parts_used(billing_status);

CREATE INDEX IF NOT EXISTS idx_service_parts_used_billed_co
  ON service_parts_used(billed_change_order_id)
  WHERE billed_change_order_id IS NOT NULL;
