-- READ ONLY: catalog inspection only. No application functions are invoked.
-- Structural compatibility is not deployment, activation or quote approval.
WITH expected_columns(table_name,column_name,type_name) AS (VALUES
 ('profiles','id','uuid'),('profiles','organization_id','uuid'),('profiles','is_active','boolean'),
 ('sales_orders','id','uuid'),('sales_orders','organization_id','uuid'),('sales_orders','proposal_id','uuid'),
 ('proposals','id','uuid'),('proposals','organization_id','uuid'),
 ('change_orders','id','uuid'),('change_orders','organization_id','uuid'),('change_orders','sales_order_id','uuid'),
 ('change_orders','status','text'),('change_orders','updated_at','timestamp with time zone'),('change_orders','is_active','boolean'),
 ('change_order_line_items','id','uuid'),('change_order_line_items','organization_id','uuid'),('change_order_line_items','change_order_id','uuid'),
 ('proposal_line_items','id','uuid'),('proposal_line_items','organization_id','uuid'),('proposal_line_items','proposal_id','uuid'),
 ('proposal_line_items','updated_at','timestamp with time zone'),('proposal_line_items','task_completed','boolean'),('proposal_line_items','tasks_seeded_at','timestamp with time zone')
), column_checks AS (
 SELECT e.*,EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=e.table_name
     AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
     AND pg_catalog.format_type(a.atttypid,a.atttypmod)=e.type_name) AS passed FROM expected_columns e
), expected_indexes(table_name,column_name) AS (VALUES
 ('change_orders','sales_order_id'),('change_order_line_items','change_order_id'),('proposal_line_items','proposal_id')
), index_checks AS (
 SELECT e.*,EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid
   JOIN pg_catalog.pg_am am ON am.oid=ix.relam JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=i.indkey[0]
   WHERE n.nspname='public' AND c.relname=e.table_name AND a.attname=e.column_name
     AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND am.amname='btree') AS passed FROM expected_indexes e
), applier AS (
 SELECT p.*,pg_catalog.pg_get_userbyid(p.proowner) AS owner_name FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('public.apply_change_order(uuid)')
), business AS (
 SELECT *,btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(prosrc,
   'v_techsafe_observation uuid; -- TECHSAFE_OBSERVER_VARIABLE','','g'),
   '(?s)-- TECHSAFE_OBSERVER_BEGIN_START.*?-- TECHSAFE_OBSERVER_BEGIN_END','','g'),
   '(?s)-- TECHSAFE_OBSERVER_FINISH_START.*?-- TECHSAFE_OBSERVER_FINISH_END','','g'),'[[:space:]]+',' ','g')) AS body FROM applier
), implementation AS (
 SELECT coalesce((SELECT encode(sha256(convert_to(btrim(regexp_replace(prosrc,'[[:space:]]+',' ','g')),'UTF8')),'hex') IN
 ('4bfa9641b1dc7fe4bddd52148b025597f8d775852eeb656b1cadaab7d2c997bd',
  '68717c75e5c5e5f3bc9f532fac50bc2ce37ae87cbae8c413aa02cf067d963333') FROM applier),false) AS recognized
), function_check AS (
 SELECT coalesce((SELECT encode(sha256(convert_to(body,'UTF8')),'hex')='4bfa9641b1dc7fe4bddd52148b025597f8d775852eeb656b1cadaab7d2c997bd'
   AND owner_name='postgres' AND prosecdef AND NOT proretset AND prorettype='void'::regtype
   AND proconfig=ARRAY['search_path=public']::text[] FROM business),false) AS passed
)
SELECT jsonb_build_object(
 'serverVersion',current_setting('server_version'),
 'structuralChecksPassed',(SELECT recognized FROM implementation) AND (SELECT passed FROM function_check) AND (SELECT bool_and(passed) FROM column_checks) AND (SELECT bool_and(passed) FROM index_checks),
 'functionImplementationRecognized',(SELECT recognized FROM implementation),
 'businessFunctionMatchesBaseline',(SELECT passed FROM function_check),
 'missingOrChangedColumns',coalesce((SELECT jsonb_agg(to_jsonb(c)-'passed' ORDER BY table_name,column_name) FROM column_checks c WHERE NOT passed),'[]'::jsonb),
 'missingParentIndexes',coalesce((SELECT jsonb_agg(to_jsonb(i)-'passed' ORDER BY table_name,column_name) FROM index_checks i WHERE NOT passed),'[]'::jsonb),
 'sourceSchemaInstalled',pg_catalog.to_regnamespace('techsafe_source') IS NOT NULL,
 'observerControlTableInstalled',pg_catalog.to_regclass('techsafe_source.application_observer_controls') IS NOT NULL,
 'observerCodePresent',coalesce((SELECT position('-- TECHSAFE_OBSERVER_BEGIN_START' IN prosrc)>0 FROM applier),false),
 'functionOwner',(SELECT owner_name FROM applier),
 'applierAnonExecuteAllowed',coalesce(has_function_privilege('anon',pg_catalog.to_regprocedure('public.apply_change_order(uuid)'),'EXECUTE'),false),
 'applierAuthenticatedExecuteAllowed',coalesce(has_function_privilege('authenticated',pg_catalog.to_regprocedure('public.apply_change_order(uuid)'),'EXECUTE'),false),
 'fullSchemaScenariosValidated',false,
 'loadAndConcurrencyValidated',false,
 'deploymentApproved',false,
 'quoteReady',false
) AS preflight;
