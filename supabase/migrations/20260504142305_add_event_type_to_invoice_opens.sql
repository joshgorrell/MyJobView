/*
  # Add event_type to invoice_opens

  ## Overview
  Extends invoice_opens to distinguish between viewing and downloading invoices,
  so staff can see full customer engagement history per invoice.

  ## Changes
  - `invoice_opens` table: adds `event_type` column (CHECK: 'viewed' | 'downloaded'), default 'viewed'
  - Updates `record_invoice_open` function to accept optional `p_event_type` parameter

  ## Notes
  - Existing rows default to 'viewed'
  - Backward compatible: calling without p_event_type still records a view
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_opens' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE invoice_opens
      ADD COLUMN event_type text NOT NULL DEFAULT 'viewed'
        CHECK (event_type IN ('viewed', 'downloaded'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION record_invoice_open(
  p_invoice_id uuid,
  p_user_agent text DEFAULT NULL,
  p_event_type text DEFAULT 'viewed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_org_id uuid;
BEGIN
  SELECT p.contact_id, p.organization_id
  INTO v_contact_id, v_org_id
  FROM profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO invoice_opens (invoice_id, contact_id, organization_id, user_agent, event_type)
  VALUES (p_invoice_id, v_contact_id, v_org_id, p_user_agent, p_event_type);
END;
$$;
