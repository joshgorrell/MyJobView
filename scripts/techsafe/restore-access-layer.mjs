import {summarizeCapture} from './catalog-capture.mjs';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
// Offline compilation of reviewed definitions; no connected-database deployment.
export function compileAccessLayer(pages){
 summarizeCapture(pages);
 const views=[],policies=[],roles=new Set(),rls=[];
 const commands={r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE','*':'ALL'};
 for(const page of pages.filter(p=>p.kind==='relations'))for(const row of page.rows){
  const o=JSON.parse(row.payload_text),table=qi(o.schema)+'.'+qi(o.name);
  if(o.kind==='m')throw new Error('Materialized views need separate review');
  if(o.kind==='v'){
   if(!o.options?.includes('security_invoker=true'))throw new Error('View must explicitly use invoker security');
   if(o.options.some(x=>!['security_invoker=true','security_barrier=true','security_barrier=false','check_option=local','check_option=cascaded'].includes(x)))throw new Error('Unsupported view option');
   if(typeof o.view!=='string'||!o.view.trim())throw new Error('Missing view definition');
   views.push({stage:'views',identity:row.identity,sql:`CREATE VIEW ${table} (${o.columns.map(c=>qi(c.name)).join(',')}) WITH (${o.options.join(',')}) AS ${o.view}`,
    quarantineSql:`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`});
  }
  if(o.kind!=='r')continue;
  if(o.rls!==true)throw new Error('Source table without RLS needs separate review');
  rls.push({stage:'rls',identity:row.identity,sql:`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} ${o.forceRls?'FORCE':'NO FORCE'} ROW LEVEL SECURITY;`});
  for(const p of o.policies??[]){
   if(!commands[p.command]||typeof p.permissive!=='boolean'||!Array.isArray(p.roles)||!p.roles.length)throw new Error('Unsupported policy');
   const targets=p.roles.map(role=>{if(role==='PUBLIC')return 'PUBLIC';if(!['anon','authenticated','service_role'].includes(role))throw new Error('Unreviewed policy role');roles.add(role);return qi(role);});
   let sql=`CREATE POLICY ${qi(p.name)} ON ${table} AS ${p.permissive?'PERMISSIVE':'RESTRICTIVE'} FOR ${commands[p.command]} TO ${targets.join(',')}`;
   if(p.using!==null)sql+=` USING (${p.using})`;
   if(p.check!==null)sql+=` WITH CHECK (${p.check})`;
   policies.push({stage:'policies',identity:row.identity,name:p.name,sql:sql+';'});
  }
 }
 return {views,policies,rls,roles:[...roles].sort(),fullBaseline:false,nativePermissionsVerified:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
// Fresh local PGlite only. API-role names get no login, memberships, grants or bypass.
export async function rehearseAccessLayer(db,plan){
 const applied=[],failures=[];
 await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
 try{
  for(const role of plan.roles){
   const rows=(await db.query('SELECT rolcanlogin,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS memberships FROM pg_roles r WHERE rolname=$1',[role])).rows;
   if(rows.length){if(rows[0].rolcanlogin||rows[0].rolsuper||rows[0].rolbypassrls||rows[0].memberships)throw new Error('Existing role is not a local quarantine role');}
   else await db.exec(`CREATE ROLE ${qi(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS;`);
  }
  async function attempt(item){
   await db.exec('SAVEPOINT access_item;');
   try{
    await db.exec(item.sql);if(item.quarantineSql)await db.exec(item.quarantineSql);
    await db.exec('RELEASE SAVEPOINT access_item;');return null;
   }catch(error){await db.exec('ROLLBACK TO SAVEPOINT access_item; RELEASE SAVEPOINT access_item;');return {stage:item.stage,identity:item.identity,...(item.name?{name:item.name}:{}),sqlState:error.code??null};}
  }
  let pending=plan.views.map(item=>({item,lastFailure:null}));
  // Retry only missing relation/function dependencies, and only while progress occurs.
  for(let pass=0;pending.length&&pass<plan.views.length;pass++){
   const next=[];let progress=0;
   for(const {item} of pending){const error=await attempt(item);
    if(!error){applied.push({stage:item.stage,identity:item.identity});progress++;}
    else if(['42P01','42883'].includes(error.sqlState))next.push({item,lastFailure:error});
    else failures.push(error);
   }
   pending=next;if(!progress)break;
  }
  failures.push(...pending.map(x=>x.lastFailure));
  for(const item of [...plan.rls,...plan.policies]){
   const error=await attempt(item);if(error)failures.push(error);else applied.push({stage:item.stage,identity:item.identity,...(item.name?{name:item.name}:{})});
  }
  await db.exec('COMMIT;');
 }catch(error){await db.exec('ROLLBACK;');throw error;}
 return {applied,failures,fullBaseline:false,nativePermissionsVerified:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
