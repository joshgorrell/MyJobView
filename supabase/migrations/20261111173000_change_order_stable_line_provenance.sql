-- Change-order reconciliation: stable provenance for *future* committed additions.
-- Existing proposal lines are intentionally not guessed or backfilled by product/name/price.
ALTER TABLE public.proposal_line_items
 ADD COLUMN IF NOT EXISTS committed_change_order_line_id uuid
 REFERENCES public.change_order_line_items(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS proposal_line_items_committed_co_line_unique
 ON public.proposal_line_items (committed_change_order_line_id)
 WHERE committed_change_order_line_id IS NOT NULL;
COMMENT ON COLUMN public.proposal_line_items.committed_change_order_line_id IS
 'Stable origin of a committed change-order addition. Never infer from matching product, quantity, description or price.';

-- Read-only diagnostic: distinguish customer approval, committed lock, and
-- legacy applied-line ambiguity. No export authorization is conferred.
CREATE OR REPLACE VIEW public.change_order_commit_readiness
WITH (security_invoker=true) AS
SELECT co.id AS change_order_id, co.organization_id, co.sales_order_id,
       co.status, co.is_locked, co.is_active AS editor_active,
       co.is_billable,
       (co.status='approved') AS customer_approved_status,
       (co.status='approved' AND co.is_locked IS TRUE) AS committed_by_legacy_flags,
       count(cli.id) AS change_line_count,
       count(cli.id) FILTER (WHERE cli.action_type='add') AS addition_count,
       count(pli.id) FILTER (WHERE cli.action_type='add') AS traced_addition_count,
       CASE
        WHEN co.status='approved' AND co.is_locked IS TRUE
          AND count(cli.id) FILTER (WHERE cli.action_type='add') >
              count(pli.id) FILTER (WHERE cli.action_type='add')
          THEN 'legacy_additions_need_provenance_reconciliation'
        WHEN co.status='approved' AND co.is_locked IS TRUE
          THEN 'locked_legacy_requires_committed_snapshot'
        WHEN co.status='approved' THEN 'approved_not_locked'
        ELSE 'not_committed'
       END AS readiness
FROM public.change_orders co
LEFT JOIN public.change_order_line_items cli ON cli.change_order_id=co.id
LEFT JOIN public.proposal_line_items pli
  ON pli.committed_change_order_line_id=cli.id
GROUP BY co.id,co.organization_id,co.sales_order_id,co.status,
         co.is_locked,co.is_active,co.is_billable;
REVOKE ALL ON public.change_order_commit_readiness FROM PUBLIC, anon;
-- Do not grant authenticated: diagnostic is for controlled migration review.
REVOKE ALL ON public.change_order_commit_readiness FROM authenticated;
