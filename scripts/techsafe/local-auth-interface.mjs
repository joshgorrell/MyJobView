import {createHash} from 'node:crypto';
// Reviewed provider definitions only. This is a local structural interface,
// never an Auth service, JWT verifier or connected-Supabase migration.
export const reviewedAuthInterfaceHash='00baafd2cc41eb04b358e87cfc1b4eb955886770b8ade3e3c408c95b67ae5b39';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
export function compileLocalAuthInterface(record){
 const actual=createHash('sha256').update(record.payload_text??'').digest('hex');
 if(actual!==record.content_hash||actual!==reviewedAuthInterfaceHash)throw new Error('Unreviewed or damaged Auth interface');
 const p=JSON.parse(record.payload_text);
 if(p.format!=='mjv-auth-interface-v1'||p.users.schema!=='auth'||p.users.name!=='users')throw new Error('Unsupported Auth interface');
 const expected=['auth.email()','auth.jwt()','auth.role()','auth.uid()'];
 if(JSON.stringify(p.routines.map(r=>r.identity))!==JSON.stringify(expected))throw new Error('Unsupported Auth routines');
 const statements=['CREATE SCHEMA auth;']; // Existing native Auth fails; never overwrite it.
 const columns=p.users.columns.map(c=>{
  if(c.identity||!['','s'].includes(c.generated))throw new Error('Unsupported Auth column');
  let sql=qi(c.name)+' '+c.type;
  if(c.generated)sql+=` GENERATED ALWAYS AS (${c.default}) STORED`;
  else if(c.default!==null)sql+=` DEFAULT ${c.default}`;
  if(c.notNull)sql+=' NOT NULL';return sql;
 });
 statements.push(`CREATE TABLE auth.users (${columns.join(',\n')});`,'ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;');
 for(const key of p.users.keys)statements.push(`ALTER TABLE auth.users ADD CONSTRAINT ${qi(key.name)} ${key.definition};`);
 for(const routine of p.routines)statements.push(routine.definition,`REVOKE ALL ON FUNCTION ${routine.identity} FROM PUBLIC;`);
 return {statements,localAuthInterface:true,nativeAuthService:false,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
