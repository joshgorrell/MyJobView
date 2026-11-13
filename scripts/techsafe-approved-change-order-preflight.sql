-- MJV -> Techsafe: read-only approved change-order provenance preflight.
-- Run in the MJV database with an authorized administrative SQL session.
-- Uses the existing change_order_commit_readiness view rather than guessing
-- whether is_active=false means an approved change has been applied.
-- No customer identifiers, equipment details, pricing or secrets are returned.
-- This diagnostic is not a certificate and cannot authorize delivery.

WITH classified AS (
  SELECT
    readiness,
    status,
    coalesce(addition_count, 0)::bigint AS additions,
    coalesce(traced_addition_count, 0)::bigint AS traced_additions,
    greatest(
      coalesce(addition_count, 0)::bigint -
      coalesce(traced_addition_count, 0)::bigint, 0
    ) AS untraced_additions
  FROM public.change_order_commit_readiness
)
SELECT
  readiness,
  status,
  count(*)::bigint AS change_orders,
  sum(additions)::bigint AS additions,
  sum(traced_additions)::bigint AS traced_additions,
  sum(untraced_additions)::bigint AS untraced_additions
FROM classified
GROUP BY readiness, status
ORDER BY readiness, status;

-- Blockers only. Exclude draft/uncommitted changes from committed source
-- readiness; these are NOT equipment the dealer has sold.
WITH classified AS (
  SELECT
    readiness,
    status,
    greatest(
      coalesce(addition_count, 0)::bigint -
      coalesce(traced_addition_count, 0)::bigint, 0
    ) AS untraced_additions
  FROM public.change_order_commit_readiness
)
SELECT
  count(*) FILTER (
    WHERE status = 'approved'
      AND (readiness IS DISTINCT FROM 'ready' OR untraced_additions > 0)
  )::bigint AS approved_changes_needing_review,
  coalesce(sum(untraced_additions) FILTER (
    WHERE status = 'approved'
  ), 0)::bigint AS approved_untraced_additions,
  count(*) FILTER (
    WHERE status IS DISTINCT FROM 'approved'
  )::bigint AS nonapproved_changes_excluded
FROM classified;

-- An approved change with a legacy readiness state must be reviewed in its
-- own Sales Order context. Do not automatically insert lines or manufacture
-- provenance. A guarded admin repair, if needed, requires separate approval.
-- The original approved equipment baseline and complete revision ledger
-- must also be certified before any outbound Techsafe snapshot.
