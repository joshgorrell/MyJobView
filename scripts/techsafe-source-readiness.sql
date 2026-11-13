-- Read-only, production-safe MJV -> Techsafe source readiness inventory.
-- Run in MJV Supabase SQL editor as a privileged administrator.
-- No identifiers, customer information, tokens or payloads are returned.
-- IMPORTANT: counts do not certify any order or authorize delivery.
-- Inspecting delivery authority is NOT equivalent to approving a repair.
WITH connection_status AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE enabled IS TRUE AND status = 'active') AS enabled_active,
    count(*) FILTER (WHERE enabled IS DISTINCT FROM TRUE OR status IS DISTINCT FROM 'active') AS disabled_or_inactive
  FROM techsafe_source.integration_connections
),
ledger_status AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE state = 'candidate') AS candidates,
    count(*) FILTER (WHERE state IS DISTINCT FROM 'candidate') AS held_or_other,
    count(*) FILTER (WHERE source_fingerprint IS NULL) AS missing_source_fingerprint
  FROM techsafe_source.order_revision_ledger
),
certificate_status AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE state = 'certified') AS marked_certified,
    count(*) FILTER (WHERE export_snapshot IS NULL) AS missing_export_snapshot,
    count(*) FILTER (WHERE event_id IS NULL) AS missing_event_id
  FROM techsafe_source.equipment_snapshot_certificates
)
SELECT 'source_connections' AS gate, total, enabled_active AS ready_or_candidate,
       disabled_or_inactive AS blocked_or_missing
FROM connection_status
UNION ALL
SELECT 'source_revision_ledger', total, candidates, held_or_other + missing_source_fingerprint
FROM ledger_status
UNION ALL
SELECT 'equipment_certificates', total, marked_certified,
       missing_export_snapshot + missing_event_id
FROM certificate_status
ORDER BY gate;

-- Inspect whether authority is still an unconditional deny at the SQL level.
-- Do not return the function body in customer-facing diagnostics.
SELECT
  count(*) AS authority_function_count,
  bool_and(pg_get_functiondef(p.oid) LIKE '%snapshot_scope_certificate_not_implemented%')
    AS contains_known_fail_closed_stop
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'techsafe_source'
  AND p.proname = 'inspect_delivery_authority';

-- Before enabling import, independently review:
-- 1. original approved proposal equipment membership and all applied COs;
-- 2. exact legacy April 8 additions (85-inch QLED and Strong mount);
-- 3. selling price per unit and separate sold labor;
-- 4. trusted, committed certificate plus export snapshot and event;
-- 5. a successful real receiver HTTP transaction and immutable purchase lock.
-- A zero blocked count is NOT an authorization signal.
