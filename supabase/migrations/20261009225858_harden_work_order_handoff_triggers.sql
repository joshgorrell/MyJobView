-- Trigger-only privileged helpers are not REST endpoints. Moving functions keeps
-- their object identities, so existing triggers continue to invoke the same code.
ALTER FUNCTION public.capture_sold_project_handoff() SET SCHEMA work_order_private;
ALTER FUNCTION public.cancel_removed_task_assignments() SET SCHEMA work_order_private;
ALTER FUNCTION public.generate_project_tasks_on_project_creation() SET SCHEMA work_order_private;
ALTER FUNCTION work_order_private.capture_sold_project_handoff() SET search_path = '';
ALTER FUNCTION work_order_private.cancel_removed_task_assignments() SET search_path = '';
ALTER FUNCTION work_order_private.generate_project_tasks_on_project_creation() SET search_path = '';
REVOKE ALL ON FUNCTION work_order_private.capture_sold_project_handoff(),work_order_private.cancel_removed_task_assignments(),work_order_private.generate_project_tasks_on_project_creation() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
