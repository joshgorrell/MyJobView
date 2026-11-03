-- Production definitions inspected read-only on 2026-10-13.
-- Only the relevant history, cancellation, and existing Internal Task close guard.
CREATE OR REPLACE FUNCTION public.log_punchlist_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
IF (TG_OP = 'INSERT') THEN
INSERT INTO punchlist_task_history (task_id, changed_by, change_type, new_values, organization_id)
VALUES (NEW.id, auth.uid(), 'created', to_jsonb(NEW), NEW.organization_id);
ELSIF (TG_OP = 'UPDATE') THEN
IF (OLD.status != NEW.status) THEN
INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
VALUES (NEW.id, auth.uid(), 'status_changed',
jsonb_build_object('status', OLD.status),
jsonb_build_object('status', NEW.status),
NEW.organization_id);
ELSE
INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
VALUES (NEW.id, auth.uid(), 'updated', to_jsonb(OLD), to_jsonb(NEW), NEW.organization_id);
END IF;

IF (NEW.status = 'completed' AND OLD.status != 'completed') THEN
UPDATE punchlist_tasks SET completed_at = now() WHERE id = NEW.id;
END IF;
END IF;
RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_log_punchlist_task_change AFTER INSERT OR UPDATE ON public.punchlist_tasks FOR EACH ROW EXECUTE FUNCTION log_punchlist_task_change();
CREATE OR REPLACE FUNCTION public.handle_service_request_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.punchlist_tasks SET status='draft',service_request_id=NULL,
      requested_at=NULL,updated_at=now()
    WHERE service_request_id=NEW.id AND status='requested';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER on_service_request_cancelled AFTER UPDATE ON public.service_requests FOR EACH ROW WHEN ((new.status = 'cancelled'::text)) EXECUTE FUNCTION handle_service_request_cancellation();
CREATE OR REPLACE FUNCTION public.require_visit_task_outcomes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND EXISTS(SELECT 1 FROM public.work_order_tasks WHERE work_order_id=NEW.id AND status IN ('pending','in_progress')) THEN
  RAISE EXCEPTION 'Record an outcome for every assigned task: complete, partial, or blocked';
 END IF;
 RETURN NEW;
END; $function$
;
CREATE TRIGGER require_visit_task_outcomes BEFORE UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION require_visit_task_outcomes();
