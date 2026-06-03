/*
  # Fix proposal_recordings RLS policy to use app_metadata instead of user_metadata

  ## Problem
  The "Portal users can view active proposal recordings" policy uses
  `auth.jwt() -> 'user_metadata'` which is editable by end users and must not
  be used in security contexts.

  ## Fix
  Replace the policy to use `auth.jwt() -> 'app_metadata'` instead, which is
  only writable by the service role.
*/

DROP POLICY IF EXISTS "Portal users can view active proposal recordings" ON public.proposal_recordings;

CREATE POLICY "Portal users can view active proposal recordings"
  ON public.proposal_recordings
  FOR SELECT
  USING (
    (is_portal_visible = true)
    AND (
      (SELECT (auth.jwt() -> 'app_metadata' ->> 'is_portal_user')) = 'true'
    )
    AND (
      EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = proposal_recordings.proposal_id
          AND p.status = ANY (ARRAY['sent','viewed','approved','approved_pending_action'])
      )
    )
  );
