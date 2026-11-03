/*
# Fix Punchlist Completion Notes Visibility for Customers

## Problem
When a technician completes a punchlist item via `report_work_order_punchlist`,
the function set `installer_notes = NULL` on the `punchlist_tasks` row. This
means the technician's completion notes were stored only in
`work_order_punchlist_items.completion_notes` (a table gated by staff-only RLS),
and the customer-visible `installer_notes` field was wiped. Customers could see
that an item was completed but had no visibility into what the technician did.

## Fix
Change `installer_notes = NULL` to `installer_notes = NULLIF(BTRIM(p_notes), '')`
so the technician's completion notes are copied to the customer-visible field
when an item is marked completed. When no notes are provided, the field stays
NULL (no change from before for the no-notes case).

## Scope
- Modified function: `public.report_work_order_punchlist` — single line change
  in the completion UPDATE block.
- No schema changes, no new tables, no RLS policy changes.
- Internal staff notes (`punchlist_staff_notes` table) remain private and
  unaffected — they are never exposed to portal users.
*/

CREATE OR REPLACE FUNCTION public.report_work_order_punchlist(
  p_work_order_id uuid,
  p_task_id uuid,
  p_outcome text,
  p_notes text,
  p_expected_updated_at timestamp with time zone
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  t public.punchlist_tasks;
  w public.work_orders;
BEGIN
  IF NOT private.punchlist_visit_access(p_work_order_id) THEN
    RAISE EXCEPTION 'Visit access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF w.status = 'completed' THEN
    RAISE EXCEPTION 'This visit is completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_order_punchlist_items
    WHERE work_order_id = w.id AND punchlist_task_id = p_task_id
    AND organization_id = w.organization_id
  ) THEN
    RAISE EXCEPTION 'Item is not on this visit';
  END IF;

  SELECT * INTO t FROM public.punchlist_tasks WHERE id = p_task_id FOR UPDATE;
  IF t.organization_id IS DISTINCT FROM w.organization_id
     OR t.contact_id IS DISTINCT FROM w.contact_id THEN
    RAISE EXCEPTION 'Item/visit mismatch';
  END IF;

  IF t.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Another person updated this item. Refresh before saving.';
  END IF;

  IF p_outcome NOT IN ('completed','unfinished') THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  IF p_outcome = 'unfinished' AND NULLIF(BTRIM(p_notes), '') IS NULL THEN
    RAISE EXCEPTION 'Explain the remaining work';
  END IF;

  IF p_outcome = 'completed' THEN
    IF t.status = 'completed' THEN RETURN; END IF;
    UPDATE public.punchlist_tasks
    SET status = 'completed',
        completed_at = now(),
        completed_by = auth.uid(),
        completed_by_customer = false,
        installer_notes = NULLIF(BTRIM(p_notes), ''),
        updated_at = now()
    WHERE id = t.id;
  ELSE
    IF t.status = 'completed' THEN
      RAISE EXCEPTION 'This customer item is already complete';
    END IF;
  END IF;

  UPDATE public.work_order_punchlist_items
  SET visit_result = p_outcome,
      completion_notes = CASE WHEN p_outcome = 'completed' THEN NULLIF(BTRIM(p_notes), '') END,
      remaining_work = CASE WHEN p_outcome = 'unfinished' THEN BTRIM(p_notes) END,
      reported_by = auth.uid(),
      reported_at = now()
  WHERE punchlist_task_id = t.id
    AND work_order_id = w.id;
END;
$function$;
