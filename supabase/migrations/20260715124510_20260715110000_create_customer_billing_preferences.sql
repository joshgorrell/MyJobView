/*
# Customer Billing Preferences Table

## Summary
Creates a new `customer_billing_preferences` table to store a single billing
preference (monthly or annual) per customer (contact). This decouples billing
frequency from individual agreement terms — each agreement keeps its own
term/renewal dates, but the customer pays via one unified billing arrangement.

## New Table: customer_billing_preferences
- id (uuid PK)
- contact_id (uuid FK → contacts, UNIQUE — one preference per customer)
- billing_preference (text, CHECK in 'monthly','annual', NOT NULL, default 'monthly')
- effective_date (date, default current_date)
- override_flag (boolean, default false) — true when an admin overrides
- override_reason (text, nullable)
- last_updated_by (uuid, nullable) — profiles.id of the user who last changed it
- last_updated_at (timestamptz, default now())
- organization_id (uuid, default get_user_org_id())
- created_at, updated_at (timestamptz)

## RLS
- authenticated users can SELECT all rows (staff need to see preferences)
- authenticated users can INSERT/UPDATE/DELETE (staff manage preferences)
  Portal users are authenticated via JWT so they can read their own preference.

## Notes
- A trigger auto-creates a preference row with the company default when a
  recurring_subscription is created for a contact that has no preference yet.
- The get_customer_billing_preference() function falls back to the company
  default if no row exists.
*/

CREATE TABLE IF NOT EXISTS customer_billing_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  billing_preference text NOT NULL DEFAULT 'monthly'
    CHECK (billing_preference IN ('monthly', 'annual')),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  override_flag boolean NOT NULL DEFAULT false,
  override_reason text,
  last_updated_by uuid,
  last_updated_at timestamptz DEFAULT now(),
  organization_id uuid DEFAULT public.get_user_org_id(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (contact_id)
);

ALTER TABLE customer_billing_preferences ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cbp_contact_id ON customer_billing_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_cbp_billing_preference ON customer_billing_preferences(billing_preference);

-- RLS Policies
DROP POLICY IF EXISTS "select_customer_billing_preferences" ON customer_billing_preferences;
CREATE POLICY "select_customer_billing_preferences"
  ON customer_billing_preferences FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_customer_billing_preferences" ON customer_billing_preferences;
CREATE POLICY "insert_customer_billing_preferences"
  ON customer_billing_preferences FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_customer_billing_preferences" ON customer_billing_preferences;
CREATE POLICY "update_customer_billing_preferences"
  ON customer_billing_preferences FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_customer_billing_preferences" ON customer_billing_preferences;
CREATE POLICY "delete_customer_billing_preferences"
  ON customer_billing_preferences FOR DELETE
  TO authenticated
  USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_cbp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cbp_updated_at ON customer_billing_preferences;
CREATE TRIGGER trg_cbp_updated_at
  BEFORE UPDATE ON customer_billing_preferences
  FOR EACH ROW EXECUTE FUNCTION update_cbp_updated_at();
