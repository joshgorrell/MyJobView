-- Reverse the net points actually awarded for the completed task, not the
-- mutable task.points field. The task row lock serializes reopen operations.
CREATE OR REPLACE FUNCTION public.reopen_task_atomic(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_net_award integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  SELECT (role = 'admin') INTO v_is_admin
  FROM public.profiles WHERE id = v_user_id;

  IF v_task.user_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the task creator or an admin can reopen this task';
  END IF;

  IF v_task.status <> 'completed' THEN RETURN; END IF;

  IF v_task.completed_by IS NOT NULL THEN
    -- Net transactions include prior awards and adjustments/reversals for
    -- this task, so repeated completion cycles are reconciled correctly.
    SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_net_award
    FROM public.points_transactions
    WHERE user_id = v_task.completed_by
      AND reference_id = p_task_id
      AND (
        transaction_type = 'task_completion'
        OR (transaction_type = 'admin_adjustment'
            AND description LIKE 'Points reversed — task reopened:%')
      );

    IF v_net_award > 0 THEN
      INSERT INTO public.points_transactions (
        user_id, points_amount, transaction_type, reference_id, description
      ) VALUES (
        v_task.completed_by, -v_net_award, 'admin_adjustment', p_task_id,
        'Points reversed — task reopened: ' || v_task.title
      );
    END IF;
  END IF;

  UPDATE public.tasks
  SET status = 'pending', completed_at = NULL,
      completed_by = NULL, claimed_by = NULL
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_task_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_task_atomic(uuid) TO authenticated;
