-- READ ONLY: source definitions/defaults only; no source rows or routine calls.
WITH definitions AS (
 SELECT 'applier'::text AS kind,'public.apply_change_order(uuid)'::text AS identity,
 encode(sha256(convert_to(pg_get_functiondef('public.apply_change_order(uuid)'::regprocedure),'UTF8')),'hex') AS content_hash,NULL::text AS value
 UNION ALL SELECT 'constraint',conname,encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex'),convalidated::text
 FROM pg_constraint WHERE conrelid='public.proposal_line_items'::regclass AND conname='proposal_line_items_cost_positive'
 UNION ALL SELECT 'default',a.attname,NULL,pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.proposal_line_items'::regclass AND a.attname IN ('cost','is_customer_supplied')
 UNION ALL SELECT 'trigger',t.tgname,encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'),t.tgenabled::text
 FROM pg_trigger t WHERE t.tgrelid='public.proposal_line_items'::regclass AND NOT t.tgisinternal
 UNION ALL SELECT 'triggerFunction',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),NULL
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE t.tgrelid='public.proposal_line_items'::regclass AND NOT t.tgisinternal
) SELECT kind,identity,content_hash,value FROM definitions ORDER BY kind,identity;
