import {summarizeCapture} from './catalog-capture.mjs';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const roles=['postgres','anon','authenticated','service_role','pg_database_owner'];
const maps={TABLE:{a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN'},
 SEQUENCE:{r:'SELECT',w:'UPDATE',U:'USAGE'},FUNCTION:{X:'EXECUTE'},PROCEDURE:{X:'EXECUTE'},TYPE:{U:'USAGE'},SCHEMA:{U:'USAGE',C:'CREATE'}};
export function decodeAcl(acl,kind,owner){
 if(!maps[kind]||!roles.includes(owner))throw new Error('Unreviewed ACL owner/kind');
 if(acl===null)acl=[owner+'='+Object.keys(maps[kind]).join('')+'/'+owner,...(['FUNCTION','PROCEDURE','TYPE'].includes(kind)?['='+Object.keys(maps[kind]).join('')+'/'+owner]:[])];
 if(!Array.isArray(acl))throw new Error('Invalid ACL');
 const grants=[];
 for(const value of acl){
  const match=/^([^=]*)=([^/]*)\/(.+)$/.exec(value);if(!match||match[1]&&!roles.includes(match[1])||!roles.includes(match[3]))throw new Error('Unreviewed ACL role');
  const grantee=match[1]||'PUBLIC';
  for(let n=0;n<match[2].length;n++){
   const letter=match[2][n],privilege=maps[kind][letter];if(!privilege)throw new Error('Unsupported ACL privilege');
   const grantable=match[2][n+1]==='*';if(grantable)n++;grants.push({grantee,privilege,grantable});
  }
 }
 return grants;
}
export function compilePrivilegeLayer(pages,metadata){
 summarizeCapture(pages);const statements=[],objects=[];
 function object(identity,kind,target,owner,acl,columns=[]){
  const grants=decodeAcl(acl,kind,owner),recipient=r=>r==='PUBLIC'?'PUBLIC':qi(r);
  statements.push({identity,sql:`REVOKE ALL ON ${kind} ${target} FROM PUBLIC,${roles.map(qi).join(',')};`});
  if(kind==='TABLE'&&columns.length)statements.push({identity,sql:`REVOKE ALL (${columns.map(c=>qi(c.name)).join(',')}) ON TABLE ${target} FROM PUBLIC,${roles.map(qi).join(',')};`});
  for(const g of grants)statements.push({identity,sql:`GRANT ${g.privilege} ON ${kind} ${target} TO ${recipient(g.grantee)}${g.grantable?' WITH GRANT OPTION':''};`});
  for(const c of columns)if(c.acl!==null)for(const g of decodeAcl(c.acl,'TABLE',owner)){
   if(!['SELECT','INSERT','UPDATE','REFERENCES'].includes(g.privilege))throw new Error('Unsupported column privilege');
   statements.push({identity,column:c.name,sql:`GRANT ${g.privilege} (${qi(c.name)}) ON TABLE ${target} TO ${recipient(g.grantee)}${g.grantable?' WITH GRANT OPTION':''};`});
  }
  objects.push({identity,kind,grants});
 }
 for(const schema of metadata.schemas)object(schema.name,'SCHEMA',qi(schema.name),schema.owner,schema.acl);
 for(const page of pages)for(const row of page.rows){
  const o=JSON.parse(row.payload_text),name=qi(o.schema)+'.'+qi(o.name);
  if(page.kind==='relations'&&['r','v','S'].includes(o.kind))object(row.identity,o.kind==='S'?'SEQUENCE':'TABLE',name,o.owner,o.acl,o.kind==='S'?[]:o.columns);
  else if(page.kind==='routines')object(row.identity,o.kind==='p'?'PROCEDURE':'FUNCTION',row.identity,o.owner,o.acl);
  else if(page.kind==='types')object(row.identity,'TYPE',name,o.owner,o.acl);
 }
 return {statements,objects,fullBaseline:false,nativePermissionsVerified:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
export async function rehearsePrivilegeLayer(db,plan){
 const applied=[],failures=[];await db.exec('BEGIN;');
 try{
  // Group by object so a missing/deferred routine cannot leave partial ACL changes.
  for(const object of plan.objects){
   await db.exec('SAVEPOINT privilege_item;');
   try{for(const item of plan.statements.filter(s=>s.identity===object.identity))await db.exec(item.sql);
    await db.exec('RELEASE SAVEPOINT privilege_item;');applied.push({identity:object.identity,kind:object.kind});
   }catch(error){await db.exec('ROLLBACK TO SAVEPOINT privilege_item; RELEASE SAVEPOINT privilege_item;');failures.push({identity:object.identity,kind:object.kind,sqlState:error.code??null});}
  }await db.exec('COMMIT;');
 }catch(error){await db.exec('ROLLBACK;');throw error;}
 return {applied,failures,fullBaseline:false,nativePermissionsVerified:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
