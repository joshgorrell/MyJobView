/*
# Billing Preference Changes Audit Table

## Summary
Creates a `billing_preference_changes` audit table to track every change
to a customer's billing preference — who changed it, when, from what to what,
and why. This provides a full audit trail for compliance and troubleshooting.

## New Table: billing_preference_changes
- id (uuid PK)
- contact_id (uuid FK → contacts, ON DELETE CASCADE)
- old_preference (text, nullable — null on first creation)
- new_preference (text, CHECK in 'monthly','annual')
- changed_by (uuid, nullable — profiles.id)
- changed_by_name (text, nullable)
- changed_at (timestamptz, default now())
- reason (text, nullable)
- organization_id (uuid, default get_user_org_id())

## RLS
- authenticated users can SELECT all rows (staff need audit visibility)
- INSERT only via SECURITY DEFINER function (update_customer_billing_preference)
  No direct INSERT/UPDATE/DELETE policy — all writes go through the RPC.

## Notes
- This table is append-only. No UPDATE or DELETE policies are defined.
- The update_customer_billing_preference() function inserts into this table.
*/

CREATE TABLE IF NOT EXISTS billing_preference_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  old_preference text,
  new_preference text NOT NULL CHECK (new_preference IN ('monthly', 'annual')),
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz DEFAULT now(),
  reason text,
  organization_id uuid DEFAULT public.get_user_org_id()
);

ALTER TABLE billing_preference_changes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bpc_contact_id ON billing_preference_changes(contact_id);
CREATE INDEX IF NOT EXISTS idx_bpc_changed_at ON billing_preference_changes(changed_at);

-- RLS: read-only for authenticated (audit trail)
DROP POLICY IF EXISTS "select_billing_preference_changes" ON billing_preference_changes;
CREATE POLICY "select_billing_preference_changes"
  ON billing_preference_changes FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — all writes via SECURITY DEFINER function
