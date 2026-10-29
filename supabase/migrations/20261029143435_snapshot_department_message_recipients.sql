/*
# Snapshot department message recipients at send time

1. New Tables
- `discussion_post_recipients`: one row per (post, user) for department-audience messages. Records who was in the department when the message was sent.
   - `post_id` (uuid, references discussion_posts, cascades on delete)
   - `user_id` (uuid, references profiles, cascades on delete)
   - `organization_id` (uuid)
   - `created_at` (timestamptz)

2. Modified Behavior
- When a department-audience message is inserted, a trigger fills in its recipient list from the department's current members (active employees in the company not explicitly denied department access).
- The message visibility rule for department messages now checks this recipient list instead of evaluating membership live. People who join a department later see only messages sent after they joined. People who leave keep no access to new messages.

3. Security
- RLS enabled on `discussion_post_recipients`.
- Authenticated users can read only their own recipient rows.
- No client insert, update, or delete. Only the trigger writes rows.
- Trigger function is not callable by clients.

4. Notes
- No existing department messages exist, so no backfill is required.
- Replies inherit visibility from the root message they belong to.
*/

CREATE TABLE IF NOT EXISTS public.discussion_post_recipients (
  post_id uuid NOT NULL REFERENCES public.discussion_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS discussion_post_recipients_user_idx ON public.discussion_post_recipients (user_id);

ALTER TABLE public.discussion_post_recipients ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.discussion_post_recipients TO authenticated;

DROP POLICY IF EXISTS "select_own_discussion_recipients" ON public.discussion_post_recipients;
CREATE POLICY "select_own_discussion_recipients" ON public.discussion_post_recipients FOR SELECT
TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION flow_private.snapshot_department_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.audience_type = 'department' AND NEW.audience_department_id IS NOT NULL AND NEW.parent_id IS NULL THEN
    INSERT INTO public.discussion_post_recipients (post_id, user_id, organization_id)
    SELECT NEW.id, p.id, NEW.organization_id
    FROM public.profiles p
    WHERE p.organization_id = NEW.organization_id
      AND p.is_active
      AND NOT EXISTS (
        SELECT 1 FROM public.department_access da
        WHERE da.organization_id = NEW.organization_id
          AND da.department_id = NEW.audience_department_id
          AND da.user_id = p.id
          AND da.has_access = false
      )
    ON CONFLICT (post_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION flow_private.snapshot_department_recipients() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS snapshot_department_recipients ON public.discussion_posts;
CREATE TRIGGER snapshot_department_recipients
AFTER INSERT ON public.discussion_posts
FOR EACH ROW EXECUTE FUNCTION flow_private.snapshot_department_recipients();

CREATE OR REPLACE FUNCTION flow_private.can_view_discussion(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  with recursive ancestry as (
    select d.*, 0 as depth from public.discussion_posts d
    where d.id=p_post_id and d.organization_id=public.get_user_org_id()
    union all
    select parent.*, child.depth+1 from public.discussion_posts parent
    join ancestry child on parent.id=child.parent_id and parent.organization_id=child.organization_id
    where child.depth<32
  )
  select (select auth.uid()) is not null
    and public.flow_has_module_access('feed')
    and exists (
      select 1 from ancestry d
      where d.parent_id is null and (
        (d.audience_type is null and (
          not coalesce(d.is_private,false) or (select auth.uid())=d.user_id
          or (select auth.uid())=d.assigned_to or ((select auth.uid())::text=any(d.mentions))
        ))
        or d.audience_type='company'
        or (d.audience_type='direct' and (
          (select auth.uid())=d.user_id or (select auth.uid())=any(d.audience_user_ids)
        ))
        or (d.audience_type='department' and (
          (select auth.uid())=d.user_id or exists (
            select 1 from public.discussion_post_recipients r
            where r.post_id=d.id and r.user_id=(select auth.uid())
          )
        ))
      )
    );
$function$;
