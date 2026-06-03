/*
  # Invoice Opens Tracking

  ## Overview
  Tracks when customers open/view their invoices in the customer portal.

  ## New Tables
  - `invoice_opens`
    - `id` - Primary key
    - `invoice_id` - FK to invoices
    - `contact_id` - FK to contacts (the customer who viewed it)
    - `organization_id` - FK to organizations (for RLS scoping)
    - `opened_at` - Timestamp of when the invoice was opened
    - `user_agent` - Browser/device info for context

  ## Security
  - RLS enabled on invoice_opens
  - Portal users can insert their own open records
  - Authenticated staff can select open records for their org

  ## Notes
  - Multiple opens per contact are recorded (not upserted) so total count is accurate
  - The portal calls a function to record each open
*/

CREATE TABLE IF NOT EXISTS invoice_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_invoice_opens_invoice_id ON invoice_opens(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_opens_contact_id ON invoice_opens(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoice_opens_organization_id ON invoice_opens(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_opens_opened_at ON invoice_opens(opened_at DESC);

ALTER TABLE invoice_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invoice opens for their org"
  ON invoice_opens FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Authenticated users can insert invoice opens"
  ON invoice_opens FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE OR REPLACE FUNCTION record_invoice_open(
  p_invoice_id uuid,
  p_user_agent text DEFAULT NULL
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

  INSERT INTO invoice_opens (invoice_id, contact_id, organization_id, user_agent)
  VALUES (p_invoice_id, v_contact_id, v_org_id, p_user_agent);
END;
$$;
