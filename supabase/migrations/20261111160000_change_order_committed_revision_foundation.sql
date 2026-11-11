-- Foundation for separately approved and committed change orders.
-- This migration deliberately does not rewrite legacy approval/application behavior.
-- Only a future audited, transaction-safe lock RPC may write committed revisions.
CREATE SCHEMA IF NOT EXISTS change_order_commit;
REVOKE ALL ON SCHEMA change_order_commit FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS change_order_commit.revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  change_order_id uuid NOT NULL REFERENCES public.change_orders(id) ON DELETE RESTRICT,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  committed_lines jsonb NOT NULL CHECK (jsonb_typeof(committed_lines) = 'array'),
  committed_totals jsonb NOT NULL CHECK (jsonb_typeof(committed_totals) = 'object'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  committed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (change_order_id, revision_number),
  UNIQUE (change_order_id, source_fingerprint)
);
CREATE INDEX IF NOT EXISTS change_order_commits_order_idx
 ON change_order_commit.revisions (organization_id, sales_order_id, change_order_id, revision_number DESC);
ALTER TABLE change_order_commit.revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON change_order_commit.revisions FROM PUBLIC, anon, authenticated;
-- No RLS policy is granted. Server-side writer must validate tenant/order/CO
-- linkage and row-lock the CO and its committed revision before insertion.
COMMENT ON TABLE change_order_commit.revisions IS
 'Immutable committed change-order snapshots; not approval records or editable drafts. No production writer enabled by this migration.';
CREATE OR REPLACE FUNCTION change_order_commit.reject_revision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'Committed change order revisions are immutable';
END $$;
DROP TRIGGER IF EXISTS reject_revision_mutation ON change_order_commit.revisions;
CREATE TRIGGER reject_revision_mutation BEFORE UPDATE OR DELETE
 ON change_order_commit.revisions FOR EACH ROW
 EXECUTE FUNCTION change_order_commit.reject_revision_mutation();
