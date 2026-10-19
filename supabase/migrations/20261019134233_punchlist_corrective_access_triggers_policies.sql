/*
# Punchlist Corrective Migration: Access Enforcement, Triggers, Policies, Work Order Integration

## Summary

This migration applies the hardened Punchlist access system that was designed in
the 20261012 and 20261018 migrations but never reached the live database. It
restores RLS policies that enforce access eligibility, recreates four critical
triggers, creates the work-order punchlist integration tables and functions,
drops the obsolete uncapped function overload, and fixes the service request
billable type.

## What This Fixes

1. **RLS policies** — replaces permissive policies that allowed any same-org user
   or any portal user with matching contact_id to read/write punchlist data
   without checking active access. New policies use private helper functions that
   verify active VIP membership or an active access grant for portal users, and
   staff module access for internal users.

2. **Guard trigger** — prevents portal users from directly changing status,
   service_request_id, work_order_id, completed_at, completed_by, or
   installer_notes via table UPDATE. Portal users can only edit title, details,
   customer_notes, and priority_order directly; all other changes must go
   through the authorized action RPCs (request_punchlist_service,
   update_punchlist_item, mark_punchlist_task_completed).

3. **Link punchlist visit trigger** — when a service request gets a work order
   assigned, automatically links all non-completed punchlist tasks for that
   customer to the work order and sets their status to 'scheduled'.

4. **Require visit outcomes trigger** — prevents completing a work order if it
   has unfinished punchlist items without documented remaining work.

5. **Release unfinished items trigger** — when a visit is completed or cancelled,
   returns unfinished scheduled items to 'draft' status so customers can
   re-request them. History is preserved in punchlist_task_history; photos,
   customer notes, and description are untouched.

6. **Work order integration tables** — creates work_order_punchlist_items and
   punchlist_staff_notes tables with proper RLS, plus the
   get_work_order_punchlist and report_work_order_punchlist RPCs that the
   technician checklist component calls.

7. **Obsolete function overload** — drops the old 3-argument
   grant_punchlist_access_directly that allowed up to 365 days with no cap.
   The 4-argument version (caps at 90, anchors to project completion date)
   remains as the only version.

8. **Service request billable type** — updates request_punchlist_service to
   set billable_type to NULL instead of 'warranty', so Punchlist service
   requests are not automatically classified as warranty work. The dispatch
   team sets the correct billing type when scheduling.

## Tables Created
- work_order_punchlist_items — links punchlist tasks to work order visits
- punchlist_staff_notes — internal technician notes, separate from customer-visible data

## Tables Modified
- None (no column changes to existing tables)

## Functions Created
- private.punchlist_staff_access(uuid) — checks internal staff access to punchlist
- private.punchlist_grant_manager(uuid) — checks admin/manager role for grant management
- private.punchlist_visit_access(uuid) — checks technician access to a work order visit
- private.punchlist_portal_identity(uuid, uuid) — verifies portal user identity via JWT claims
- private.punchlist_entitled(uuid, uuid) — checks active VIP or access grant entitlement
- private.punchlist_portal_access(uuid, uuid) — portal identity + entitlement
- private.punchlist_staff_identity(uuid) — checks internal staff identity (no module check)
- private.guard_punchlist_api_update() — trigger: blocks portal users from changing protected fields
- private.link_punchlist_visit() — trigger: links tasks to work orders when SR gets a WO
- private.require_punchlist_visit_outcomes() — trigger: blocks WO completion with unfinished items
- private.release_unfinished_punchlist_items() — trigger: releases unfinished items on visit close
- public.get_work_order_punchlist(uuid) — returns punchlist items for a work order visit
- public.report_work_order_punchlist(uuid, uuid, text, text, timestamptz) — technician outcome reporting
- public.save_punchlist_staff_note(uuid, text) — saves internal technician notes

## Functions Modified
- public.request_punchlist_service — billable_type changed from 'warranty' to NULL
- private.punchlist_customer_access — updated to check entitlement for portal users

## Functions Dropped
- public.grant_punchlist_access_directly(uuid, integer, text) — old uncapped 3-arg overload

## Security Changes
- RLS policies on punchlist_tasks, punchlist_task_photos, punchlist_access_grants
  replaced with hardened versions using private helper functions
- RLS enabled on work_order_punchlist_items and punchlist_staff_notes
- All new SECURITY DEFINER functions have REVOKE FROM PUBLIC, anon
- Guard trigger prevents portal users from bypassing authorized action RPCs

## Important Notes

1. The installer_notes column on punchlist_tasks is preserved (not dropped) to
   avoid data loss. Existing installer_notes data is migrated to
   punchlist_staff_notes. The guard trigger prevents new writes to
   installer_notes via the API; staff must use save_punchlist_staff_note.

2. The old 3-argument grant_punchlist_access_directly is dropped AFTER the
   frontend caller (ContactDetail.tsx) is updated to pass p_project_id. The
   4-argument version with p_project_id=NULL creates promotional/complimentary
   access capped at 90 days.

3. History is preserved: the existing trigger_log_punchlist_task_change trigger
   captures every status change to punchlist_task_history. The
   release_unfinished_punchlist_items trigger only resets status,
   work_order_id, service_request_id, and requested_at — it does not touch
   title, details, customer_notes, photos, or completion data.

4. The release trigger checks that no OTHER active visit still holds the item
   before returning it to draft, so items on multi-visit schedules are not
   prematurely released.
*/

-- ============================================================================
-- 1. Create private schema and helper functions
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

-- Staff access: internal user with active profile and punchlist_admin module access
CREATE OR REPLACE FUNCTION private.punchlist_staff_access(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT COALESCE((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.organization_id = p_org
        AND p.contact_id IS NULL
        AND p.role NOT IN ('portal_user','customer','portal','client')
        AND public.flow_has_module_access('punchlist_admin')
    );
$$;

-- Grant manager: staff access plus admin/manager role
CREATE OR REPLACE FUNCTION private.punchlist_grant_manager(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.punchlist_staff_access(p_org)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','manager','office_manager','sales_manager','project_manager','service_manager')
    );
$$;

-- Staff identity: like staff_access but without module check (used for restrictive policies)
CREATE OR REPLACE FUNCTION private.punchlist_staff_identity(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT COALESCE((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = p_org
        AND p.is_active
        AND p.contact_id IS NULL
        AND p.role NOT IN ('portal_user','customer','portal','client')
    );
$$;

-- Visit access: technician assigned to or managing a work order
CREATE OR REPLACE FUNCTION private.punchlist_visit_access(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT COALESCE((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.work_orders w
      JOIN public.profiles p ON p.organization_id = w.organization_id
      WHERE w.id = p_order
        AND p.id = auth.uid()
        AND p.is_active
        AND p.contact_id IS NULL
        AND p.role NOT IN ('portal_user','customer','portal','client')
        AND (
          w.assigned_to = p.id
          OR p.role IN ('admin','manager','office_manager','service_manager','project_manager','dispatcher')
        )
    );
$$;

-- Portal identity: verifies portal user matches contact+org via JWT claims or profile
CREATE OR REPLACE FUNCTION private.punchlist_portal_identity(p_contact uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (COALESCE((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean, false)
     AND auth.jwt()->'app_metadata'->>'contact_id' = p_contact::text
     AND auth.jwt()->'app_metadata'->>'organization_id' = p_org::text)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.role IN ('portal_user','customer','portal','client')
        AND p.contact_id = p_contact
        AND p.organization_id = p_org
    )
  );
$$;

-- Entitlement: active VIP membership OR active access grant (test_and_tune, promotional, vip_trial)
CREATE OR REPLACE FUNCTION private.punchlist_entitled(p_contact uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recurring_subscriptions s
    JOIN public.recurring_plans rp ON rp.id = s.plan_id
    WHERE s.contact_id = p_contact
      AND s.organization_id = p_org
      AND s.status = 'active'
      AND rp.plan_type = 'vip_plan'
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
      AND s.next_billing_date >= CURRENT_DATE
  )
  OR EXISTS (
    SELECT 1 FROM public.punchlist_access_grants g
    LEFT JOIN public.recurring_subscriptions s ON s.id = g.subscription_id
    WHERE g.contact_id = p_contact
      AND g.organization_id = p_org
      AND g.status = 'active'
      AND (g.expiration_date IS NULL OR g.expiration_date >= CURRENT_DATE)
      AND (g.access_type <> 'vip_trial'
           OR (s.status IN ('trial','active')
               AND s.trial_source = 'vip_trial'
               AND s.trial_end_date >= CURRENT_DATE))
  );
$$;

-- Portal access: portal identity AND active entitlement
CREATE OR REPLACE FUNCTION private.punchlist_portal_access(p_contact uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.punchlist_portal_identity(p_contact, p_org)
    AND private.punchlist_entitled(p_contact, p_org);
$$;

REVOKE ALL ON FUNCTION private.punchlist_staff_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_grant_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_staff_identity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_visit_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_portal_identity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_entitled(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.punchlist_portal_access(uuid, uuid) FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_staff_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_visit_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_portal_identity(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.punchlist_portal_access(uuid, uuid) TO authenticated;

-- Update punchlist_customer_access to check entitlement for portal users
CREATE OR REPLACE FUNCTION private.punchlist_customer_access(p_contact_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_meta jsonb := auth.jwt()->'app_metadata';
  v_is_portal boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_is_portal := COALESCE((v_meta->>'is_portal_user')::boolean, false);

  IF v_is_portal THEN
    IF v_meta->>'contact_id' IS DISTINCT FROM p_contact_id::text
       OR v_meta->>'organization_id' IS DISTINCT FROM p_org_id::text THEN
      RAISE EXCEPTION 'Punchlist item access denied' USING ERRCODE = '42501';
    END IF;
    IF NOT private.punchlist_entitled(p_contact_id, p_org_id) THEN
      RAISE EXCEPTION 'Active VIP or Test & Tune access is required' USING ERRCODE = '42501';
    END IF;
    RETURN true;
  END IF;

  IF NOT private.punchlist_staff_access(p_org_id) THEN
    RAISE EXCEPTION 'Punchlist item access denied' USING ERRCODE = '42501';
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.punchlist_customer_access(uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- 2. Create work_order_punchlist_items and punchlist_staff_notes tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.work_order_punchlist_items (
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  punchlist_task_id uuid NOT NULL REFERENCES public.punchlist_tasks(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  visit_result text CHECK (visit_result IN ('completed','unfinished')),
  completion_notes text,
  remaining_work text,
  reported_by uuid REFERENCES public.profiles(id),
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_order_id, punchlist_task_id)
);

CREATE INDEX IF NOT EXISTS work_order_punchlist_task_idx
  ON public.work_order_punchlist_items(punchlist_task_id);

CREATE TABLE IF NOT EXISTS public.punchlist_staff_notes (
  task_id uuid PRIMARY KEY REFERENCES public.punchlist_tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_order_punchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punchlist_staff_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.work_order_punchlist_items, public.punchlist_staff_notes FROM anon;
GRANT SELECT ON public.work_order_punchlist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punchlist_staff_notes TO authenticated;

-- Migrate existing installer_notes to punchlist_staff_notes (preserve data, keep column)
INSERT INTO public.punchlist_staff_notes (task_id, organization_id, notes)
SELECT t.id, t.organization_id, t.installer_notes
FROM public.punchlist_tasks t
WHERE NULLIF(BTRIM(t.installer_notes), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.punchlist_staff_notes n WHERE n.task_id = t.id
  )
ON CONFLICT (task_id) DO NOTHING;

-- RLS policies for the new tables
DROP POLICY IF EXISTS "visit_punchlist_read" ON public.work_order_punchlist_items;
CREATE POLICY "visit_punchlist_read"
  ON public.work_order_punchlist_items FOR SELECT TO authenticated
  USING (private.punchlist_visit_access(work_order_id));

DROP POLICY IF EXISTS "staff_punchlist_notes" ON public.punchlist_staff_notes;
CREATE POLICY "staff_punchlist_notes"
  ON public.punchlist_staff_notes FOR ALL TO authenticated
  USING (private.punchlist_staff_access(organization_id))
  WITH CHECK (
    private.punchlist_staff_access(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.punchlist_tasks t
      WHERE t.id = punchlist_staff_notes.task_id
        AND t.organization_id = punchlist_staff_notes.organization_id
    )
  );

-- ============================================================================
-- 3. Create get_work_order_punchlist and report_work_order_punchlist RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_work_order_punchlist(p_work_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.punchlist_visit_access(p_work_order_id) THEN
    RAISE EXCEPTION 'Visit access denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id,
      'description', COALESCE(NULLIF(BTRIM(t.details), ''), t.title),
      'status', CASE WHEN a.visit_result = 'completed' THEN 'completed' ELSE t.status END,
      'updated_at', t.updated_at,
      'customer_notes', t.customer_notes,
      'completion_notes', a.completion_notes,
      'internal_notes', n.notes,
      'previous_visit_notes', (
        SELECT previous.remaining_work
        FROM public.work_order_punchlist_items previous
        JOIN public.work_orders prior_visit ON prior_visit.id = previous.work_order_id
        WHERE previous.punchlist_task_id = t.id
          AND previous.work_order_id <> a.work_order_id
          AND prior_visit.status IN ('completed','cancelled')
          AND previous.reported_at < a.created_at
          AND NULLIF(BTRIM(previous.remaining_work), '') IS NOT NULL
        ORDER BY previous.reported_at DESC LIMIT 1
      ),
      'visit_result', a.visit_result,
      'remaining_work', a.remaining_work,
      'photos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', ph.id, 'photo_url', ph.photo_url))
        FROM public.punchlist_task_photos ph WHERE ph.task_id = t.id
      ), '[]'::jsonb)
    ) ORDER BY t.priority_order, t.created_at, t.id)
    FROM public.work_order_punchlist_items a
    JOIN public.punchlist_tasks t ON t.id = a.punchlist_task_id
    JOIN public.work_orders visit ON visit.id = a.work_order_id
    LEFT JOIN public.punchlist_staff_notes n ON n.task_id = t.id
    WHERE a.work_order_id = p_work_order_id
      AND t.organization_id = a.organization_id
      AND visit.organization_id = a.organization_id
      AND t.contact_id = visit.contact_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_work_order_punchlist(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work_order_punchlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_work_order_punchlist(
  p_work_order_id uuid,
  p_task_id uuid,
  p_outcome text,
  p_notes text,
  p_expected_updated_at timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
        installer_notes = NULL,
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
$$;
REVOKE ALL ON FUNCTION public.report_work_order_punchlist(uuid, uuid, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_work_order_punchlist(uuid, uuid, text, text, timestamptz)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_punchlist_staff_note(p_task_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.punchlist_tasks;
BEGIN
  SELECT * INTO t FROM public.punchlist_tasks WHERE id = p_task_id;
  IF NOT FOUND OR NOT private.punchlist_staff_access(t.organization_id) THEN
    RAISE EXCEPTION 'Staff note access denied' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.punchlist_staff_notes (task_id, organization_id, notes, updated_at)
  VALUES (t.id, t.organization_id, NULLIF(BTRIM(p_notes), ''), now())
  ON CONFLICT (task_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_punchlist_staff_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_punchlist_staff_note(uuid, text) TO authenticated;

-- ============================================================================
-- 4. Restore triggers
-- ============================================================================

-- 4a. Guard trigger: prevents portal users from changing protected fields
CREATE OR REPLACE FUNCTION private.guard_punchlist_api_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_user = 'authenticated'
     AND private.punchlist_portal_identity(OLD.contact_id, OLD.organization_id)
     AND (to_jsonb(NEW) - ARRAY['title','details','customer_notes','priority_order','updated_at'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['title','details','customer_notes','priority_order','updated_at'])
  THEN
    RAISE EXCEPTION 'Use the authorized Punchlist action to change status or completion notes'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.installer_notes IS NOT NULL THEN
    RAISE EXCEPTION 'Technician notes must be saved as internal notes';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_punchlist_api_update() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS guard_punchlist_api_update ON public.punchlist_tasks;
CREATE TRIGGER guard_punchlist_api_update
  BEFORE INSERT OR UPDATE ON public.punchlist_tasks
  FOR EACH ROW EXECUTE FUNCTION private.guard_punchlist_api_update();

-- 4b. Link punchlist visit: auto-link tasks to work orders when SR gets a WO
CREATE OR REPLACE FUNCTION private.link_punchlist_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  primary_order public.work_orders;
BEGIN
  IF NEW.work_order_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.work_order_id IS NOT DISTINCT FROM OLD.work_order_id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO primary_order FROM public.work_orders WHERE id = NEW.work_order_id;

  IF primary_order.organization_id IS DISTINCT FROM NEW.organization_id
     OR primary_order.contact_id IS DISTINCT FROM NEW.contact_id THEN
    RAISE EXCEPTION 'Punchlist visit customer/organization mismatch';
  END IF;

  -- Link all non-completed punchlist tasks for this customer/service request
  -- to the work order (and any sibling visits sharing the same creation_request_id)
  INSERT INTO public.work_order_punchlist_items (work_order_id, punchlist_task_id, organization_id)
  SELECT w.id, t.id, NEW.organization_id
  FROM public.work_orders w
  CROSS JOIN public.punchlist_tasks t
  WHERE t.service_request_id = NEW.id
    AND t.organization_id = NEW.organization_id
    AND t.contact_id = NEW.contact_id
    AND t.status <> 'completed'
    AND w.organization_id = NEW.organization_id
    AND w.contact_id = NEW.contact_id
    AND (w.id = NEW.work_order_id
         OR (primary_order.creation_request_id IS NOT NULL
             AND w.creation_request_id = primary_order.creation_request_id))
  ON CONFLICT DO NOTHING;

  -- Update task status to scheduled and set work_order_id
  UPDATE public.punchlist_tasks
  SET work_order_id = NEW.work_order_id,
      status = 'scheduled',
      updated_at = now()
  WHERE service_request_id = NEW.id
    AND organization_id = NEW.organization_id
    AND contact_id = NEW.contact_id
    AND status <> 'completed';

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.link_punchlist_visit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS link_punchlist_visit ON public.service_requests;
CREATE TRIGGER link_punchlist_visit
  AFTER INSERT OR UPDATE OF work_order_id ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION private.link_punchlist_visit();

-- 4c. Require visit outcomes: block WO completion with unfinished punchlist items
CREATE OR REPLACE FUNCTION private.require_punchlist_visit_outcomes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM public.work_order_punchlist_items a
      JOIN public.punchlist_tasks t ON t.id = a.punchlist_task_id
      WHERE a.work_order_id = NEW.id
        AND t.status <> 'completed'
        AND (a.visit_result IS DISTINCT FROM 'unfinished'
             OR NULLIF(BTRIM(a.remaining_work), '') IS NULL)
    ) THEN
      RAISE EXCEPTION 'Complete each Customer Punchlist item or explain its remaining work before closing this visit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_punchlist_visit_outcomes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_punchlist_visit_outcomes ON public.work_orders;
CREATE TRIGGER require_punchlist_visit_outcomes
  BEFORE UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.require_punchlist_visit_outcomes();

-- 4d. Release unfinished items: return unfinished items to draft when visit closes
CREATE OR REPLACE FUNCTION private.release_unfinished_punchlist_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Only release items that have no OTHER active visit holding them
    UPDATE public.punchlist_tasks t
    SET status = 'draft',
        work_order_id = NULL,
        service_request_id = NULL,
        requested_at = NULL,
        updated_at = now()
    WHERE t.status <> 'completed'
      AND EXISTS (
        SELECT 1 FROM public.work_order_punchlist_items a
        WHERE a.work_order_id = NEW.id AND a.punchlist_task_id = t.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.work_order_punchlist_items a
        JOIN public.work_orders w ON w.id = a.work_order_id
        WHERE a.punchlist_task_id = t.id
          AND w.status NOT IN ('completed','cancelled')
      );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.release_unfinished_punchlist_items() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS release_unfinished_punchlist_items ON public.work_orders;
CREATE TRIGGER release_unfinished_punchlist_items
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.release_unfinished_punchlist_items();

-- ============================================================================
-- 5. Backfill work_order_punchlist_items from existing data
-- ============================================================================

-- Link tasks that already have a work_order_id set
INSERT INTO public.work_order_punchlist_items (work_order_id, punchlist_task_id, organization_id)
SELECT t.work_order_id, t.id, t.organization_id
FROM public.punchlist_tasks t
JOIN public.work_orders w ON w.id = t.work_order_id
  AND w.organization_id = t.organization_id
  AND w.contact_id = t.contact_id
WHERE t.work_order_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Link tasks via service_request -> work_order relationship
INSERT INTO public.work_order_punchlist_items (work_order_id, punchlist_task_id, organization_id)
SELECT w.id, t.id, t.organization_id
FROM public.punchlist_tasks t
JOIN public.service_requests s
  ON s.id = t.service_request_id
  AND s.organization_id = t.organization_id
  AND s.contact_id = t.contact_id
JOIN public.work_orders primary_order
  ON primary_order.id = s.work_order_id
  AND primary_order.organization_id = t.organization_id
  AND primary_order.contact_id = t.contact_id
JOIN public.work_orders w
  ON w.organization_id = t.organization_id
  AND w.contact_id = t.contact_id
  AND (w.id = primary_order.id
       OR (primary_order.creation_request_id IS NOT NULL
           AND w.creation_request_id = primary_order.creation_request_id))
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. Replace RLS policies on punchlist_tasks, punchlist_task_photos, punchlist_access_grants
-- ============================================================================

DO $$ DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('punchlist_tasks','punchlist_task_photos','punchlist_access_grants')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- punchlist_tasks: staff policies
CREATE POLICY "staff_punchlist_items_select"
  ON public.punchlist_tasks FOR SELECT TO authenticated
  USING (private.punchlist_staff_access(organization_id));

CREATE POLICY "staff_punchlist_items_insert"
  ON public.punchlist_tasks FOR INSERT TO authenticated
  WITH CHECK (
    private.punchlist_staff_access(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = punchlist_tasks.contact_id
        AND c.organization_id = punchlist_tasks.organization_id
    )
  );

CREATE POLICY "staff_punchlist_items_update"
  ON public.punchlist_tasks FOR UPDATE TO authenticated
  USING (private.punchlist_staff_access(organization_id))
  WITH CHECK (private.punchlist_staff_access(organization_id));

CREATE POLICY "staff_punchlist_items_delete"
  ON public.punchlist_tasks FOR DELETE TO authenticated
  USING (private.punchlist_staff_access(organization_id));

-- punchlist_tasks: portal policies
CREATE POLICY "portal_punchlist_read"
  ON public.punchlist_tasks FOR SELECT TO authenticated
  USING (private.punchlist_portal_access(contact_id, organization_id));

CREATE POLICY "portal_punchlist_insert"
  ON public.punchlist_tasks FOR INSERT TO authenticated
  WITH CHECK (
    private.punchlist_portal_access(contact_id, organization_id)
    AND status = 'draft'
    AND installer_notes IS NULL
    AND service_request_id IS NULL
    AND work_order_id IS NULL
  );

CREATE POLICY "portal_punchlist_update"
  ON public.punchlist_tasks FOR UPDATE TO authenticated
  USING (private.punchlist_portal_access(contact_id, organization_id))
  WITH CHECK (private.punchlist_portal_access(contact_id, organization_id));

CREATE POLICY "portal_punchlist_delete"
  ON public.punchlist_tasks FOR DELETE TO authenticated
  USING (
    private.punchlist_portal_access(contact_id, organization_id)
    AND status = 'draft'
    AND work_order_id IS NULL
    AND service_request_id IS NULL
  );

-- punchlist_task_photos: staff policies
CREATE POLICY "staff_punchlist_photos_all"
  ON public.punchlist_task_photos FOR ALL TO authenticated
  USING (private.punchlist_staff_access(organization_id))
  WITH CHECK (private.punchlist_staff_access(organization_id));

-- punchlist_task_photos: portal policies
CREATE POLICY "portal_punchlist_photos_read"
  ON public.punchlist_task_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.punchlist_tasks t
      WHERE t.id = punchlist_task_photos.task_id
        AND private.punchlist_portal_access(t.contact_id, t.organization_id)
    )
  );

CREATE POLICY "portal_punchlist_photos_insert"
  ON public.punchlist_task_photos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.punchlist_tasks t
      WHERE t.id = punchlist_task_photos.task_id
        AND t.organization_id = punchlist_task_photos.organization_id
        AND private.punchlist_portal_access(t.contact_id, t.organization_id)
    )
  );

CREATE POLICY "portal_punchlist_photos_delete"
  ON public.punchlist_task_photos FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.punchlist_tasks t
      WHERE t.id = punchlist_task_photos.task_id
        AND private.punchlist_portal_access(t.contact_id, t.organization_id)
        AND t.status = 'draft'
    )
  );

-- punchlist_access_grants: staff policies
CREATE POLICY "staff_punchlist_grants_read"
  ON public.punchlist_access_grants FOR SELECT TO authenticated
  USING (private.punchlist_staff_access(organization_id));

CREATE POLICY "staff_punchlist_grants_manage"
  ON public.punchlist_access_grants FOR ALL TO authenticated
  USING (private.punchlist_grant_manager(organization_id))
  WITH CHECK (private.punchlist_grant_manager(organization_id));

-- punchlist_access_grants: portal read own grants
CREATE POLICY "portal_punchlist_grants_read"
  ON public.punchlist_access_grants FOR SELECT TO authenticated
  USING (private.punchlist_portal_identity(contact_id, organization_id));

-- ============================================================================
-- 7. Add restrictive policy to punchlist_task_history for staff-only access
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'punchlist_task_history'
      AND policyname = 'staff_note_privacy'
  ) THEN
    EXECUTE 'CREATE POLICY staff_note_privacy ON public.punchlist_task_history AS RESTRICTIVE
      FOR SELECT TO authenticated
      USING (private.punchlist_staff_identity(organization_id))';
  END IF;
END $$;

-- ============================================================================
-- 8. Drop obsolete 3-argument grant_punchlist_access_directly overload
-- ============================================================================

-- The 4-argument version (with p_project_id) remains as the only version.
-- It caps p_days at 90 and anchors test_and_tune grants to completion date.
-- Frontend callers must pass p_project_id (NULL for complimentary access).
DROP FUNCTION IF EXISTS public.grant_punchlist_access_directly(uuid, integer, text);

-- ============================================================================
-- 9. Fix request_punchlist_service: remove hardcoded warranty billable_type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_punchlist_service(
  p_task_ids uuid[],
  p_contact_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_ids uuid[];
  v_count int;
  v_request_id uuid;
  v_existing uuid[];
  v_description text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;

  PERFORM private.punchlist_customer_access(p_contact_id, v_contact.organization_id);

  -- Serialize requests and item mutations for this customer
  PERFORM 1 FROM public.contacts WHERE id = p_contact_id FOR UPDATE;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
  FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one item';
  END IF;

  SELECT count(*) INTO v_count FROM public.punchlist_tasks
  WHERE id = ANY(v_ids) AND contact_id = p_contact_id
    AND organization_id = v_contact.organization_id;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Invalid punchlist selection' USING ERRCODE = '42501';
  END IF;

  -- Exact retries return the existing open request
  IF NOT EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND (status <> 'requested' OR service_request_id IS NULL)
  ) THEN
    SELECT array_agg(DISTINCT service_request_id) INTO v_existing
    FROM public.punchlist_tasks WHERE id = ANY(v_ids);
    IF cardinality(v_existing) = 1 AND EXISTS (
      SELECT 1 FROM public.service_requests WHERE id = v_existing[1] AND status = 'open'
    ) THEN
      RETURN v_existing[1];
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND (status <> 'draft' OR service_request_id IS NOT NULL OR work_order_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Some selected items have already been requested. Refresh your list.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND COALESCE(NULLIF(BTRIM(details), ''), NULLIF(BTRIM(title), '')) IS NULL
  ) THEN
    RAISE EXCEPTION 'Describe what needs attention before requesting service';
  END IF;

  SELECT string_agg('- ' || COALESCE(NULLIF(BTRIM(details), ''), title), E'\n'
    ORDER BY priority_order, created_at, id)
  INTO v_description
  FROM public.punchlist_tasks WHERE id = ANY(v_ids);

  INSERT INTO public.service_requests (
    organization_id, contact_id, customer_name, customer_phone, customer_email,
    job_location_address, job_location_city, job_location_state, job_location_zip,
    job_description, billable_type, billable_by, priority, notes, status,
    source_type, created_by
  ) VALUES (
    v_contact.organization_id, p_contact_id,
    COALESCE(v_contact.full_name, v_contact.company_name, 'Customer'),
    v_contact.phone, v_contact.email,
    COALESCE(v_contact.street_address, 'Address on file'),
    v_contact.city, v_contact.state, v_contact.zip_code,
    'Punchlist Service Request' || E'\n\n' || v_description
      || COALESCE(E'\n\nNotes: ' || NULLIF(BTRIM(p_notes), ''), ''),
    NULL, NULL, 'normal',
    'Created from customer punchlist portal', 'open', 'punchlist',
    (SELECT id FROM public.profiles WHERE id = auth.uid())
  ) RETURNING id INTO v_request_id;

  UPDATE public.punchlist_tasks
  SET status = 'requested',
      service_request_id = v_request_id,
      requested_at = now(),
      updated_at = now()
  WHERE id = ANY(v_ids);

  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) TO authenticated;

-- ============================================================================
-- 10. Update get_punchlist_access_info to use the new private helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_punchlist_access_info(p_contact_id uuid)
RETURNS TABLE(
  has_access boolean,
  access_type text,
  days_remaining integer,
  expiration_date date,
  subscription_plan_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.contacts WHERE id = p_contact_id;
  IF v_org IS NULL
     OR NOT (private.punchlist_portal_identity(p_contact_id, v_org)
             OR private.punchlist_staff_identity(v_org)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Check active VIP membership first
  RETURN QUERY
  SELECT true, 'vip_membership'::text, NULL::integer, s.end_date::date, rp.plan_name
  FROM public.recurring_subscriptions s
  JOIN public.recurring_plans rp ON rp.id = s.plan_id
  WHERE s.contact_id = p_contact_id
    AND s.organization_id = v_org
    AND s.status = 'active'
    AND rp.plan_type = 'vip_plan'
    AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
    AND s.next_billing_date >= CURRENT_DATE
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Check access grants
  RETURN QUERY
  SELECT true, g.access_type,
    CASE WHEN g.expiration_date IS NULL THEN NULL
         ELSE g.expiration_date - CURRENT_DATE END,
    g.expiration_date, rp.plan_name
  FROM public.punchlist_access_grants g
  LEFT JOIN public.recurring_subscriptions s ON s.id = g.subscription_id
  LEFT JOIN public.recurring_plans rp ON rp.id = s.plan_id
  WHERE g.contact_id = p_contact_id
    AND g.organization_id = v_org
    AND g.status = 'active'
    AND (g.expiration_date IS NULL OR g.expiration_date >= CURRENT_DATE)
    AND (g.access_type <> 'vip_trial'
         OR (s.status IN ('trial','active')
             AND s.trial_source = 'vip_trial'
             AND s.trial_end_date >= CURRENT_DATE))
  ORDER BY g.expiration_date DESC NULLS FIRST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::date, NULL::text;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_punchlist_access_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_punchlist_access_info(uuid) TO authenticated;

-- ============================================================================
-- 11. Add realtime publication for new tables
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.work_order_punchlist_items, public.punchlist_staff_notes;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
