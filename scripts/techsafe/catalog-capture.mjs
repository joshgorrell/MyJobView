import {createHash} from 'node:crypto';
// Catalog data only: callers must not execute captured SQL or call application routines.
const schemas="'public','private','flow_private','pto_private','sales_credit_private','time_private','work_order_private','jobs'";
const queries={
 relations:`SELECT format('%I.%I',n.nspname,c.relname) AS identity,jsonb_build_object(
 'schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
 'options',c.reloptions,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'persistence',c.relpersistence,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
   'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl,
   'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'kind',contype,'definition',pg_get_constraintdef(oid),'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('name',ix.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY ix.relname) FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r) FROM unnest(p.polroles) r),
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),
 'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) END,
 'partitionKey',CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END,
 'partitionBound',pg_get_expr(c.relpartbound,c.oid),
 'parents',(SELECT jsonb_agg(i.inhparent::regclass::text ORDER BY i.inhseqno) FROM pg_inherits i WHERE i.inhrelid=c.oid),
 'sequence',(SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart::text,'increment',s.seqincrement::text,'minimum',s.seqmin::text,'maximum',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=c.oid)
 ) AS payload FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN (${schemas}) AND c.relkind IN ('r','p','v','m','S','c','f')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')`,
 routines:`SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS identity,
 jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
 'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'language',l.lanname,
 'definition',pg_get_functiondef(p.oid),'securityDefiner',p.prosecdef,'config',p.proconfig,
 'outboundReview',p.prosrc ~* '(net[.]http_|http_(get|post|put|delete)|cron[.](schedule|alter_job)|dblink|smtp|https?://)') AS payload
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname IN (${schemas}) AND p.prokind IN ('f','p')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')`,
 types:`SELECT format('%I.%I',n.nspname,t.typname) AS identity,jsonb_build_object('schema',n.nspname,'name',t.typname,
 'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'baseType',format_type(t.typbasetype,t.typtypmod),
 'notNull',t.typnotnull,'default',t.typdefault,
 'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),
 'range',(SELECT to_jsonb(r) FROM pg_range r WHERE r.rngtypid=t.oid OR r.rngmultitypid=t.oid LIMIT 1)) AS payload
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN (${schemas}) AND t.typtype IN ('e','d','r','m')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')`,
 managedAdjuncts:`SELECT format('%I.%I',n.nspname,c.relname) AS identity,jsonb_build_object('schema',n.nspname,'name',c.relname,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'customTriggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname)
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace
 WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND fn.nspname IN (${schemas})),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
 'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r) FROM unnest(p.polroles) r),
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) AS payload
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','storage') AND c.relkind IN ('r','p')`,
};
export const captureKinds=Object.freeze(Object.keys(queries));
export function captureQuery(kind,offset=0,limit=20){
 if(!captureKinds.includes(kind))throw new Error('Unsupported catalog kind');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(limit)||limit<1||limit>25)throw new Error('Invalid catalog page');
 return `WITH objects AS (${queries[kind]}), page AS (SELECT * FROM objects ORDER BY identity LIMIT ${limit} OFFSET ${offset}) SELECT identity,payload::text AS payload_text,encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS content_hash FROM page ORDER BY identity;`;
}
// Diagnostic export format only. Captured definitions are never a native dump,
// executable restore plan or evidence that runtime/financial scenarios passed.
export function summarizeCapture(pages){
 const summary={format:'mjv-catalog-capture-v2',nativePgDump:false,restoreApproved:false,quoteReady:false,counts:{},outboundReview:[],objects:[]};
 const seen=new Set();
 for(const page of pages){
  if(!captureKinds.includes(page.kind)||!Array.isArray(page.rows))throw new Error('Invalid catalog page');
  for(const row of page.rows){
   if(typeof row.identity!=='string'||typeof row.payload_text!=='string'||!/^[a-f0-9]{64}$/.test(row.content_hash))throw new Error('Malformed catalog object');
   if(createHash('sha256').update(row.payload_text,'utf8').digest('hex')!==row.content_hash)throw new Error('Catalog payload hash mismatch');
   const payload=JSON.parse(row.payload_text);
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Malformed catalog payload');
   const key=page.kind+':'+row.identity;if(seen.has(key))throw new Error('Duplicate catalog object');seen.add(key);
   summary.counts[page.kind]=(summary.counts[page.kind]??0)+1;
   summary.objects.push({kind:page.kind,identity:row.identity,contentHash:row.content_hash});
   if(payload.outboundReview===true)summary.outboundReview.push(row.identity);
  }
 }
 summary.objects.sort((a,b)=>{const left=a.kind+':'+a.identity,right=b.kind+':'+b.identity;return left<right?-1:left>right?1:0;});
 summary.outboundReview.sort();return summary;
}
export function captureCountQuery(kind){
 if(!captureKinds.includes(kind))throw new Error('Unsupported catalog kind');
 return `WITH objects AS (${queries[kind]}) SELECT count(*)::int AS count FROM objects;`;
}
export const catalogStampQuery=`WITH scope AS (SELECT oid FROM pg_namespace WHERE nspname IN (${schemas},'auth','storage')),
 entries AS (
 SELECT 'class:'||c.oid AS key,c.xmin::text AS version FROM pg_class c WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'attribute:'||a.attrelid||':'||a.attnum,a.xmin::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'function:'||p.oid,p.xmin::text FROM pg_proc p WHERE p.pronamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'constraint:'||c.oid,c.xmin::text FROM pg_constraint c WHERE c.connamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'type:'||t.oid,t.xmin::text FROM pg_type t WHERE t.typnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'enum:'||e.oid,e.xmin::text FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'trigger:'||t.oid,t.xmin::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'policy:'||p.oid,p.xmin::text FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'index:'||i.indexrelid,i.xmin::text FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'sequence:'||s.seqrelid,s.xmin::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'rewrite:'||r.oid,r.xmin::text FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class WHERE c.relnamespace IN (SELECT oid FROM scope)
 UNION ALL SELECT 'namespace:'||n.oid,n.xmin::text FROM pg_namespace n WHERE n.oid IN (SELECT oid FROM scope)
 UNION ALL SELECT 'defaultAcl:'||d.oid,d.xmin::text FROM pg_default_acl d
 UNION ALL SELECT 'extension:'||e.oid,e.xmin::text FROM pg_extension e
 ) SELECT encode(sha256(convert_to(string_agg(key||':'||version,E'\n' ORDER BY key),'UTF8')),'hex') AS catalog_stamp FROM entries;`;
export function captureFingerprintQuery(kind){
 if(!captureKinds.includes(kind))throw new Error('Unsupported catalog kind');
 return `WITH objects AS (${queries[kind]}) SELECT identity,encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS content_hash FROM objects ORDER BY identity;`;
}
export function finalizeCapture(pages,{expectedCounts,beforeStamp,afterStamp,fingerprints}){
 if(!/^[a-f0-9]{64}$/.test(beforeStamp??'')||beforeStamp!==afterStamp)throw new Error('Catalog changed or stamp missing');
 const summary=summarizeCapture(pages);
 for(const kind of captureKinds){
  const expected=expectedCounts?.[kind];
  if(!Number.isSafeInteger(expected)||expected<0||(summary.counts[kind]??0)!==expected)throw new Error('Catalog count mismatch');
  const entries=summary.objects.filter(x=>x.kind===kind);
  const fresh=fingerprints?.[kind];
  if(!Array.isArray(fresh)||fresh.length!==entries.length)throw new Error('Missing live fingerprints');
  const map=new Map(fresh.map(r=>[r.identity,r.content_hash]));
  if(map.size!==fresh.length||entries.some(e=>map.get(e.identity)!==e.contentHash))throw new Error('Catalog fingerprint mismatch');
 }
 return {...summary,catalogStamp:afterStamp,catalogPagesComplete:true,liveFingerprintsMatch:true};
}
