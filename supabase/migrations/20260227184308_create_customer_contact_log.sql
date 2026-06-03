/*
  # Create Customer Contact Log Table

  ## Summary
  Adds a persistent log of every customer contact attempt made by staff against
  work orders and service requests. Previously only a single timestamp was stored
  (customer_contact_confirmed_at); this table captures the full history with notes.

  ## New Tables

  ### customer_contact_log
  - `id` (uuid, primary key) — unique row identifier
  - `organization_id` (uuid, FK → organizations) — multi-tenant scoping
  - `work_order_id` (uuid, nullable FK → work_orders) — linked work order
  - `service_request_id` (uuid, nullable FK → service_requests) — linked service request
  - `logged_by` (uuid, FK → profiles) — staff member who logged the contact
  - `logged_by_name` (text) — snapshot of staff name at log time
  - `notes` (text, not null) — free-text description of the contact
  - `created_at` (timestamptz, default now()) — when the log entry was created

  ## Constraints
  - At least one of work_order_id or service_request_id must be set (CHECK constraint)

  ## Indexes
  - `idx_customer_contact_log_work_order_id` — fast lookups by work order
  - `idx_customer_contact_log_service_request_id` — fast lookups by service request
  - `idx_customer_contact_log_organization_id` — fast org-scoped queries
  - `idx_customer_contact_log_created_at` — sorting by recency

  ## Security
  - RLS enabled — all authenticated users in the org can insert and select
  - Only the logger or admins can delete their own entries
*/

CREATE TABLE IF NOT EXISTS customer_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
  service_request_id uuid REFERENCES service_requests(id) ON DELETE CASCADE,
  logged_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  logged_by_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT contact_log_has_target CHECK (
    work_order_id IS NOT NULL OR service_request_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_contact_log_work_order_id
  ON customer_contact_log(work_order_id);

CREATE INDEX IF NOT EXISTS idx_customer_contact_log_service_request_id
  ON customer_contact_log(service_request_id);

CREATE INDEX IF NOT EXISTS idx_customer_contact_log_organization_id
  ON customer_contact_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_customer_contact_log_created_at
  ON customer_contact_log(created_at DESC);

ALTER TABLE customer_contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact logs in their org"
  ON customer_contact_log FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert contact logs in their org"
  ON customer_contact_log FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND logged_by = auth.uid()
  );

CREATE POLICY "Users can delete their own contact log entries"
  ON customer_contact_log FOR DELETE
  TO authenticated
  USING (logged_by = auth.uid());
