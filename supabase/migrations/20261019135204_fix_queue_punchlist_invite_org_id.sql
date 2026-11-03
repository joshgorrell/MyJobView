/*
# Fix queue_punchlist_invite: set organization_id on insert

## Summary

The `queue_punchlist_invite` trigger on `projects` inserts into
`pending_punchlist_invites` without setting `organization_id`. The column is
NOT NULL with a default of `get_user_org_id()`, which returns NULL inside a
trigger (no authenticated user context). This caused a constraint violation
whenever a project's `substantial_completion_date` was set.

## What This Fixes

Sets `organization_id` to `NEW.organization_id` (the project's organization)
in the INSERT, so the pending invite is correctly associated with the org.

## Functions Modified
- public.queue_punchlist_invite — adds organization_id to the INSERT

## Important Notes
- This is a pre-existing bug, not caused by the corrective migration.
- CREATE OR REPLACE FUNCTION makes this idempotent.
*/

CREATE OR REPLACE FUNCTION public.queue_punchlist_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.substantial_completion_date IS NOT NULL
     AND (OLD.substantial_completion_date IS NULL OR OLD.substantial_completion_date != NEW.substantial_completion_date) THEN

    IF NOT EXISTS (
      SELECT 1 FROM pending_punchlist_invites
      WHERE contact_id = NEW.contact_id AND status = 'pending'
    ) AND NOT EXISTS (
      SELECT 1 FROM punchlist_access_grants
      WHERE contact_id = NEW.contact_id AND status = 'active'
        AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
    ) THEN
      INSERT INTO pending_punchlist_invites (
        contact_id, project_id, organization_id, status, notes
      ) VALUES (
        NEW.contact_id, NEW.id, NEW.organization_id, 'pending',
        'Auto-queued on project substantial completion: ' || NEW.name
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_punchlist_invite() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
