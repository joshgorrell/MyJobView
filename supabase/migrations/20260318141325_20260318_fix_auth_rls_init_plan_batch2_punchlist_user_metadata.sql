/*
  # Fix Auth RLS Initialization Plan - Batch 2: Punchlist user_metadata References

  ## Summary
  Replaces `user_metadata` JWT references with `app_metadata` in punchlist_tasks
  and punchlist_task_photos policies. The `user_metadata` field is editable by
  end users and should NOT be used for authorization decisions. `app_metadata`
  is server-controlled and safe for security checks.

  ## Security Improvement
  `auth.jwt() -> 'user_metadata'` can be modified by the authenticated user
  using supabase.auth.update(), making it unsuitable for authorization.
  `auth.jwt() -> 'app_metadata'` is only modifiable server-side.

  ## Tables Fixed
  - punchlist_tasks: 4 portal user policies
  - punchlist_task_photos: 2 portal user policies
*/

-- ============================================================
-- punchlist_tasks - replace user_metadata with app_metadata
-- ============================================================
DROP POLICY IF EXISTS "Portal users can view their own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can view their own punchlist tasks"
  ON public.punchlist_tasks FOR SELECT
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
  );

DROP POLICY IF EXISTS "Portal users can insert own punchlist tasks via metadata" ON public.punchlist_tasks;
CREATE POLICY "Portal users can insert own punchlist tasks via metadata"
  ON public.punchlist_tasks FOR INSERT
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
    AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid
  );

DROP POLICY IF EXISTS "Portal users can update their own punchlist tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can update their own punchlist tasks"
  ON public.punchlist_tasks FOR UPDATE
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
  );

DROP POLICY IF EXISTS "Portal users can delete their own draft tasks" ON public.punchlist_tasks;
CREATE POLICY "Portal users can delete their own draft tasks"
  ON public.punchlist_tasks FOR DELETE
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
    AND status = 'draft'::text
  );

-- Update the insert_same_org policy to use app_metadata too
DROP POLICY IF EXISTS "punchlist_tasks_insert_same_org" ON public.punchlist_tasks;
CREATE POLICY "punchlist_tasks_insert_same_org"
  ON public.punchlist_tasks FOR INSERT
  WITH CHECK (
    (organization_id = get_user_org_id())
    OR (
      ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
      AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid
    )
  );

-- ============================================================
-- punchlist_task_photos - replace user_metadata with app_metadata
-- ============================================================
DROP POLICY IF EXISTS "Portal users can view photos for their tasks" ON public.punchlist_task_photos;
CREATE POLICY "Portal users can view photos for their tasks"
  ON public.punchlist_task_photos FOR SELECT
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
      AND pt.contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
    )
  );

DROP POLICY IF EXISTS "Portal users can insert photos for their tasks" ON public.punchlist_task_photos;
CREATE POLICY "Portal users can insert photos for their tasks"
  ON public.punchlist_task_photos FOR INSERT
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'is_portal_user'))::boolean = true
    AND organization_id = ((auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid
    AND EXISTS (
      SELECT 1 FROM punchlist_tasks pt
      WHERE pt.id = punchlist_task_photos.task_id
      AND pt.contact_id = ((auth.jwt() -> 'app_metadata' ->> 'contact_id'))::uuid
    )
  );
