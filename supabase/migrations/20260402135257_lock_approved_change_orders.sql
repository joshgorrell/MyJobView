/*
  # Lock Approved Change Orders

  ## Summary
  Prevents approved (or pending_approval/rejected/completed) change orders from being
  re-activated for editing. Once a change order moves past "draft" status it must be
  permanently read-only.

  ## Changes
  1. Add a CHECK constraint so `is_active` can only be TRUE when `status = 'draft'`
  2. Ensure any currently-active non-draft COs are deactivated (data cleanup)

  ## Security
  No RLS changes — existing policies cover write access.
*/

-- 1. Deactivate any non-draft COs that are currently marked active (data cleanup)
UPDATE change_orders
SET is_active = false
WHERE status <> 'draft'
  AND is_active = true;

-- 2. Add constraint: is_active=true is only valid on draft COs
ALTER TABLE change_orders
  ADD CONSTRAINT chk_active_only_on_draft
  CHECK (
    is_active = false
    OR (is_active = true AND status = 'draft')
  );
