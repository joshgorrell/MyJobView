-- SECURITY DEFINER RPCs created in public inherit schema default EXECUTE grants.
-- REVOKE FROM PUBLIC alone is insufficient if anon/authenticated/service_role
-- have explicit grants. Keep untested financial writer inaccessible.
REVOKE ALL ON FUNCTION public.commit_staged_change_order_material_revision(uuid,bigint)
FROM PUBLIC, anon, authenticated, service_role;

DO $test$
BEGIN
 IF has_function_privilege('authenticated','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE')
    OR has_function_privilege('anon','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE')
    OR has_function_privilege('service_role','public.commit_staged_change_order_material_revision(uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'Financial revision writer must remain inaccessible until transaction tests pass';
 END IF;
END;
$test$;
