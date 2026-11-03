-- READ ONLY: provider object definitions, not Auth users, sessions or credentials.
WITH payload AS (SELECT jsonb_build_object(
 'format','mjv-auth-interface-v1',
 'routines',(SELECT jsonb_agg(jsonb_build_object('identity',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname IN ('uid','jwt','role','email') AND p.pronargs=0),
 'users',jsonb_build_object('schema','auth','name','users',
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'keys',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='auth.users'::regclass AND contype='p'))
 ) AS value) SELECT value::text AS payload_text,encode(sha256(convert_to(value::text,'UTF8')),'hex') AS content_hash FROM payload;
