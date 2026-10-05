/*
  # Department task assignment and atomic completion

  Adds three assignment scopes to regular Tasks:
  - Anyone (assigned_to and assigned_department_id are null)
  - Department (assigned_department_id)
  - Person (assigned_to)

  Department membership reuses MJV's existing role_department_access and
  department_user_overrides model. Department members are notified on assignment.

  complete_task_atomic() locks the task row, validates eligibility, completes it,
  records the completing user, awards points once, and notifies the creator/watchers
  in one transaction. This prevents two users from earning points for the same task.
*/

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_department_id
  ON public.tasks(assigned_department_id);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_single_assignment_target;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_single_assignment_target
  CHECK (NOT (assigned_to IS NOT NULL AND assigned_department_id IS NOT NULL));

CREATE OR REPLACE FUNCTION public.user_has_department_access(
  p_user_id uuid,
  p_department_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_department_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
        AND p.role = 'admin'
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM department_user_overrides duo
      WHERE duo.user_id = p_user_id
        AND duo.department_id = p_department_id
        AND duo.has_access = true
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_department_access rda
        ON rda.role_id = p.role_id
       AND rda.department_id = p_department_id
       AND rda.has_access = true
      WHERE p.id = p_user_id
        AND COALESCE(p.is_active, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM department_user_overrides deny_override
        WHERE deny_override.user_id = p_user_id
          AND deny_override.department_id = p_department_id
          AND deny_override.has_access = false
      )
    ) THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.user_has_department_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_department_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_task_department_ids()
RETURNS TABLE(department_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM departments d
  WHERE d.is_active = true
    AND public.user_has_department_access(auth.uid(), d.id);
$$;

REVOKE ALL ON FUNCTION public.get_my_task_department_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_task_department_ids() TO authenticated;

DROP POLICY IF EXISTS "Internal users can view open team tasks" ON public.tasks;
CREATE POLICY "Internal users can view open team tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to IS NULL
    AND assigned_department_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND COALESCE(p.role, '') <> 'portal_user'
    )
  );

DROP POLICY IF EXISTS "Department members can view department tasks" ON public.tasks;
CREATE POLICY "Department members can view department tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_department_id IS NOT NULL
    AND public.user_has_department_access(auth.uid(), assigned_department_id)
  );

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_body text;
  v_department_name text;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    SELECT COALESCE(full_name, company_name)
      INTO v_customer_name
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;

  v_body := CASE
    WHEN NULLIF(v_customer_name, '') IS NOT NULL
      THEN NEW.title || ' — ' || v_customer_name
    ELSE NEW.title
  END;

  -- Person assignment: notify only that employee.
  IF NEW.assigned_to IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
     ) THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    VALUES (NEW.assigned_to, 'Task Assigned to You', v_body, 'task_assigned', false, NEW.id, now());
  END IF;

  -- Department assignment: notify every active member once when the task enters/moves departments.
  IF NEW.assigned_department_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_department_id IS DISTINCT FROM NEW.assigned_department_id
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     ) THEN
    SELECT display_name INTO v_department_name
    FROM departments
    WHERE id = NEW.assigned_department_id;

    INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
    SELECT p.id,
           COALESCE(v_department_name, 'Department') || ' Task Assigned',
           v_body,
           'task_assigned',
           false,
           NEW.id,
           now()
    FROM profiles p
    WHERE COALESCE(p.is_active, true) = true
      AND public.user_has_department_access(p.id, NEW.assigned_department_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON public.tasks;
CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to, assigned_department_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();

-- Completion notifications are handled by complete_task_atomic so the actor never
-- receives a redundant "you just completed this" status notification.
DROP TRIGGER IF EXISTS trigger_notify_task_status_changed ON public.tasks;

CREATE OR REPLACE FUNCTION public.complete_task_atomic(p_task_id uuid)
RETURNS TABLE (
  task_id uuid,
  completed_by uuid,
  points_awarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_points integer := 0;
  v_completer_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status = 'completed' THEN
    RAISE EXCEPTION 'Task was already completed';
  END IF;

  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF v_task.assigned_to IS NOT NULL THEN
    IF v_task.assigned_to <> v_user_id
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'This task is assigned to another user';
    END IF;
  ELSIF v_task.assigned_department_id IS NOT NULL THEN
    IF NOT public.user_has_department_access(v_user_id, v_task.assigned_department_id)
       AND v_task.user_id <> v_user_id
       AND NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'You do not have access to this department task';
    END IF;
  END IF;

  v_points := COALESCE(v_task.points, 0);

  UPDATE tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = v_user_id,
      claimed_by = v_user_id
  WHERE id = p_task_id;

  IF v_points > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_user_id,
      v_points,
      'task_completion',
      p_task_id,
      'Completed task: ' || v_task.title
    );
  END IF;

  SELECT COALESCE(full_name, 'Team member')
    INTO v_completer_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO notifications (user_id, title, body, type, is_read, related_id, created_at)
  SELECT recipients.user_id,
         'Task Completed',
         v_task.title || ' — completed by ' || COALESCE(v_completer_name, 'Team member'),
         'task',
         false,
         p_task_id,
         now()
  FROM (
    SELECT v_task.user_id AS user_id
    UNION
    SELECT tw.user_id
    FROM task_watchers tw
    WHERE tw.task_id = p_task_id
  ) recipients
  WHERE recipients.user_id IS NOT NULL
    AND recipients.user_id <> v_user_id;

  RETURN QUERY SELECT p_task_id, v_user_id, v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_task_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_task_atomic(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  SELECT (role = 'admin') INTO v_is_admin FROM profiles WHERE id = v_user_id;

  IF v_task.user_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the task creator or an admin can reopen this task';
  END IF;

  IF v_task.status <> 'completed' THEN RETURN; END IF;

  IF v_task.completed_by IS NOT NULL AND COALESCE(v_task.points, 0) > 0 THEN
    INSERT INTO points_transactions (
      user_id, points_amount, transaction_type, reference_id, description
    )
    VALUES (
      v_task.completed_by,
      -COALESCE(v_task.points, 0),
      'admin_adjustment',
      p_task_id,
      'Points reversed — task reopened: ' || v_task.title
    );
  END IF;

  UPDATE tasks
  SET status = 'pending',
      completed_at = null,
      completed_by = null,
      claimed_by = null
  WHERE id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_task_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_task_atomic(uuid) TO authenticated;


-- Force completion through the atomic RPC so points/claiming cannot be bypassed
-- by a direct client-side status update.
CREATE OR REPLACE FUNCTION public.enforce_atomic_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed'
     AND NEW.completed_by IS NULL THEN
    RAISE EXCEPTION 'Use complete_task_atomic() to complete tasks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_atomic_task_completion ON public.tasks;
CREATE TRIGGER trigger_enforce_atomic_task_completion
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_atomic_task_completion();
