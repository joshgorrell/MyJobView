-- READ ONLY: preview candidates for the guarded legacy addition repair.
-- This does NOT run repair_legacy_approved_change_addition or change customer data.
-- Review each row manually, including whether the equipment is still sold after
-- subsequent approved removals. Never auto-repair on a positive preview.
WITH approved_additions AS (
 SELECT
   co.id AS change_order_id, li.id AS change_line_id,
   co.sales_order_id, so.proposal_id, co.organization_id,
   co.change_order_number, li.product_id,
   coalesce(li.product_description,li.product_name) AS description,
   li.new_quantity,li.new_unit_price,li.new_labor_total,
   co.status,co.is_locked,co.is_active,co.approval_date,
   co.requires_customer_approval,co.customer_approved,
   li.proposal_line_item_id
 FROM public.change_orders co
 JOIN public.change_order_line_items li
   ON li.change_order_id=co.id AND li.organization_id=co.organization_id
 JOIN public.sales_orders so
   ON so.id=co.sales_order_id AND so.organization_id=co.organization_id
 WHERE co.status='approved' AND li.action_type='add'
), evaluated AS (
 SELECT a.*,
   EXISTS (
    SELECT 1 FROM public.proposal_line_items pli
    WHERE pli.proposal_id=a.proposal_id
      AND pli.organization_id=a.organization_id
      AND pli.committed_change_order_line_id=a.change_line_id
   ) AS has_exact_committed_line,
   EXISTS (
    SELECT 1 FROM public.proposal_line_items pli
    WHERE pli.proposal_id=a.proposal_id
      AND pli.organization_id=a.organization_id
      AND pli.committed_change_order_line_id IS NULL
      AND pli.product_id IS NOT DISTINCT FROM a.product_id
      AND pli.description=a.description
      AND pli.unit_price=a.new_unit_price
      AND pli.quantity=a.new_quantity
   ) AS has_ambiguous_unlinked_match,
   EXISTS (
    SELECT 1 FROM change_order_commit.revisions r
    WHERE r.change_order_id=a.change_order_id
      AND r.organization_id=a.organization_id
   ) AS is_revision_tracked,
   EXISTS (
    SELECT 1 FROM public.change_orders later
    JOIN public.change_order_line_items removed
      ON removed.change_order_id=later.id
      AND removed.organization_id=later.organization_id
    WHERE later.sales_order_id=a.sales_order_id
      AND later.organization_id=a.organization_id
      AND later.status='approved'
      AND later.approval_date > a.approval_date
      AND removed.action_type='remove'
      AND (removed.proposal_line_item_id=a.proposal_line_item_id
           OR (a.product_id IS NOT NULL AND removed.product_id=a.product_id))
   ) AS possibly_removed_later
 FROM approved_additions a
)
SELECT change_order_number,change_order_id,change_line_id,sales_order_id,
       new_quantity AS sold_quantity,new_unit_price AS equipment_unit_price,
       new_labor_total AS sold_labor,
       has_exact_committed_line,has_ambiguous_unlinked_match,
       is_revision_tracked,possibly_removed_later,
       CASE
         WHEN has_exact_committed_line THEN 'already_linked'
         WHEN has_ambiguous_unlinked_match THEN 'manual_duplicate_review'
         WHEN possibly_removed_later THEN 'manual_removal_review'
         WHEN is_revision_tracked THEN 'use_revision_reconciliation'
         WHEN status <> 'approved' OR is_locked IS DISTINCT FROM TRUE
           OR is_active IS DISTINCT FROM FALSE OR approval_date IS NULL
           OR (requires_customer_approval IS TRUE AND customer_approved IS DISTINCT FROM TRUE)
           THEN 'approval_or_commit_not_proven'
         ELSE 'candidate_only_requires_admin_approval'
       END AS review_status
FROM evaluated
ORDER BY change_order_number,change_line_id;

-- The above removal test is intentionally conservative. A later removal
-- may identify an original line by a different key. Manual review of CO3
-- is mandatory even if possibly_removed_later=false.
