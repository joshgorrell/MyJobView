import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {captureQuery,captureKinds} from '../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../scripts/techsafe/restore-table-layer.mjs';
import {compileLocalAuthInterface} from '../../scripts/techsafe/local-auth-interface.mjs';
import {compileAccessLayer,rehearseAccessLayer} from '../../scripts/techsafe/restore-access-layer.mjs';
const source=new PGlite(),destination=new PGlite(),elevated=new PGlite();
async function capture(db){const pages=[];for(const kind of captureKinds)for(let offset=0;;offset+=25){const rows=(await db.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;pages.push({kind,offset,rows});}return pages;}
try{
const auth=compileLocalAuthInterface(JSON.parse(fs.readFileSync('tests/techsafe/fixtures/auth-interface-catalog.json','utf8')));
for(const db of [source,destination])for(const sql of auth.statements)await db.exec(sql);
await source.exec(`CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;
CREATE TABLE public.tenant_rows(id integer,owner_id uuid,payload text,enabled boolean);
ALTER TABLE public.tenant_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_owns ON public.tenant_rows FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY enabled_only ON public.tenant_rows AS RESTRICTIVE FOR SELECT TO authenticated USING(enabled);
CREATE POLICY anonymous_deny ON public.tenant_rows FOR SELECT TO anon USING(false);
CREATE VIEW public.z_base WITH(security_invoker=true,security_barrier=true) AS SELECT id,owner_id,payload FROM public.tenant_rows;
CREATE VIEW public.a_outer WITH(security_invoker=true) AS SELECT id,payload FROM public.z_base;`);
const pages=await capture(source);for(const item of compileTableLayer(pages).statements)await destination.exec(item.sql);
const plan=compileAccessLayer(pages),result=await rehearseAccessLayer(destination,plan);
assert.deepEqual(result.failures,[]);assert.deepEqual(result.applied.filter(x=>x.stage==='views').map(x=>x.identity),['public.z_base','public.a_outer']);
const restored=await capture(destination);
for(const page of pages.filter(p=>p.kind==='relations'))for(const row of page.rows){
 const original=JSON.parse(row.payload_text),target=JSON.parse(restored.flatMap(p=>p.kind==='relations'?p.rows:[]).find(r=>r.identity===row.identity).payload_text);
 assert.deepEqual(target.policies,original.policies);assert.equal(target.rls,original.rls);assert.equal(target.forceRls,original.forceRls);
 if(original.kind==='v'){assert.equal(target.view,original.view);assert.deepEqual(target.options,original.options);assert.deepEqual(target.columns,original.columns);}
}
await destination.exec(`INSERT INTO public.tenant_rows VALUES
 (1,'10000000-0000-0000-0000-000000000001','A',true),
 (2,'10000000-0000-0000-0000-000000000002','B',true),
 (3,'10000000-0000-0000-0000-000000000001','hidden',false);
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 GRANT SELECT,INSERT,UPDATE ON public.tenant_rows TO authenticated;
 GRANT SELECT ON public.a_outer,public.z_base TO authenticated;
 SET ROLE authenticated;`);
const setActor=async id=>destination.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated'})]);
await setActor('10000000-0000-0000-0000-000000000001');
assert.deepEqual((await destination.query('SELECT * FROM public.a_outer ORDER BY id')).rows,[{id:1,payload:'A'}]);
await assert.rejects(destination.exec("INSERT INTO public.tenant_rows VALUES(4,'10000000-0000-0000-0000-000000000002','cross tenant',true)"),e=>e.code==='42501');
await assert.rejects(destination.exec("UPDATE public.tenant_rows SET owner_id='10000000-0000-0000-0000-000000000002' WHERE id=1"),e=>e.code==='42501');
await setActor('10000000-0000-0000-0000-000000000002');
assert.deepEqual((await destination.query('SELECT * FROM public.a_outer ORDER BY id')).rows,[{id:2,payload:'B'}]);
await destination.query("SELECT set_config('request.jwt.claims','',false)");
assert.deepEqual((await destination.query('SELECT * FROM public.a_outer')).rows,[]);
await destination.exec('RESET ROLE;SET ROLE anon;');await assert.rejects(destination.query('SELECT * FROM public.a_outer'),e=>e.code==='42501');await destination.exec('RESET ROLE;');
assert.equal(result.nativePermissionsVerified,false);assert.equal(result.runtimeTestsAllowed,false);assert.equal(result.quoteReady,false);
const altered=structuredClone(pages),view=altered.flatMap(p=>p.kind==='relations'?p.rows:[]).find(r=>r.identity==='public.a_outer');
const value=JSON.parse(view.payload_text);value.options=null;view.payload_text=JSON.stringify(value);view.content_hash=createHash('sha256').update(view.payload_text).digest('hex');
assert.throws(()=>compileAccessLayer(altered),/invoker security/);
const damaged=structuredClone(pages);damaged[0].rows[0].payload_text+=' ';assert.throws(()=>compileAccessLayer(damaged),/hash mismatch/);
await elevated.exec('CREATE ROLE authenticated NOLOGIN BYPASSRLS;');await assert.rejects(rehearseAccessLayer(elevated,plan),/quarantine role/);
// A persistent missing dependency stops with one explicit failure, not an endless retry.
const missing=await rehearseAccessLayer(destination,{...plan,roles:[],rls:[],policies:[],views:[{stage:'views',identity:'public.unresolved',sql:'CREATE VIEW public.unresolved WITH(security_invoker=true) AS SELECT * FROM public.missing_dependency'}]});
assert.equal(missing.failures.length,1);assert.equal(missing.failures[0].sqlState,'42P01');
console.log('Access-layer checks passed: bounded dependency ordering, native view/options/column/policy/RLS comparison, invoker-view tenant reads, restrictive filtering, WITH CHECK write protection, anonymous/missing claims denial, non-invoker/tamper rejection and elevated-role refusal. This is not a production authorization audit.');
}finally{await source.close();await destination.close();await elevated.close();}
