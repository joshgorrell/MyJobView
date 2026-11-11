-- Non-mutating regression checks for the staged revision commit feature.
-- Run in CI against a disposable database or in a read-only production audit.
DO $test$
DECLARE v_guard text;v_writer text;v_privileged boolean;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_guard FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='guard_locked_change_order_line_mutation';
 SELECT pg_get_functiondef(p.oid) INTO v_writer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_staged_change_order_material_revision';
 IF v_guard IS NULL OR v_writer IS NULL THEN RAISE EXCEPTION 'Revision writer or locked-line guard missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='change_order_line_items' AND t.tgname='trg_guard_locked_change_order_line_mutation' AND t.tgenabled<>'D') THEN
  RAISE EXCEPTION 'Locked source line protection trigger missing or disabled';
 END IF;
 IF has_function_privilege('authenticated','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'Untested revision writer is accessible to API roles';
 END IF;
 -- The writer currently updates change_order_line_items while status=approved and is_locked=true.
 -- The trigger rejects that update. Do not enable the writer until a secure,
 -- transaction-scoped, non-client-spoofable revision authorization is implemented.
 IF position('UPDATE public.change_order_line_items' IN v_writer)>0 AND
    position('Cannot modify lines of a locked or finalized change order' IN v_guard)>0 THEN
  RAISE NOTICE 'Known blocker: writer source-line UPDATE conflicts with finalized-line guard';
 ELSE
  RAISE NOTICE 'Review writer/guard integration before granting EXECUTE';
 END IF;
END;
$test$;
