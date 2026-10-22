-- Discussion tasks share server-authoritative completion, reversal and points.
-- This is intentionally separate from public.tasks because discussion_posts has
-- its own workflow and permissions.
CREATE OR REPLACE FUNCTION public.set_discussion_task_completion(
  p_post_id uuid, p_complete boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post public.discussion_posts%ROWTYPE;
  v_actor uuid := auth.uid();
  v_admin boolean := false;
  v_points integer := 0;
  v_outstanding integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_post FROM public.discussion_posts
  WHERE id = p_post_id AND post_type = 'task' AND parent_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discussion assignment not found'; END IF;

  SELECT role = 'admin' INTO v_admin FROM public.profiles WHERE id = v_actor;
  IF v_actor <> v_post.user_id
     AND v_actor IS DISTINCT FROM v_post.assigned_to
     AND NOT COALESCE(v_admin,false) THEN
    RAISE EXCEPTION 'Not authorized to update this discussion assignment';
  END IF;

  IF p_complete THEN
    IF COALESCE(v_post.is_completed,false) THEN RETURN; END IF;
    SELECT task_completion_points INTO v_points
    FROM public.points_configuration LIMIT 1;
    v_points := COALESCE(v_post.points,v_points,10);
    IF v_points < 0 THEN RAISE EXCEPTION 'Task points must not be negative'; END IF;

    UPDATE public.discussion_posts SET is_completed = true,
      completed_at = now(), completed_by = v_actor WHERE id = p_post_id;

    IF v_points > 0 THEN
      INSERT INTO public.points_transactions
        (user_id,points_amount,transaction_type,reference_id,description)
      VALUES (v_actor,v_points,'task_completion',p_post_id,
        'Completed discussion task: ' || left(v_post.content,100));
      INSERT INTO public.notifications
        (user_id,type,title,body)
      VALUES (v_actor,'system','+'||v_points||' Points!',
        'You earned '||v_points||' points for completing a task');
    END IF;
  ELSE
    IF NOT COALESCE(v_post.is_completed,false) THEN RETURN; END IF;
    IF v_actor <> v_post.user_id AND NOT COALESCE(v_admin,false) THEN
      RAISE EXCEPTION 'Only the creator or an admin can reopen this task';
    END IF;

    IF v_post.completed_by IS NOT NULL THEN
      SELECT COALESCE(SUM(points_amount),0)::integer INTO v_outstanding
      FROM public.points_transactions
      WHERE user_id = v_post.completed_by AND reference_id = p_post_id
        AND (transaction_type = 'task_completion'
          OR (transaction_type = 'admin_adjustment'
            AND description LIKE 'Points reversed — discussion task reopened:%'));
      IF v_outstanding > 0 THEN
        INSERT INTO public.points_transactions
          (user_id,points_amount,transaction_type,reference_id,description)
        VALUES (v_post.completed_by,-v_outstanding,'admin_adjustment',p_post_id,
          'Points reversed — discussion task reopened: '||left(v_post.content,100));
      END IF;
    END IF;
    UPDATE public.discussion_posts SET is_completed = false,
      completed_at = NULL, completed_by = NULL WHERE id = p_post_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_discussion_task_completion(uuid,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_discussion_task_completion(uuid,boolean)
  TO authenticated;
