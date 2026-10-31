import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {captureQuery,captureKinds} from '../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../scripts/techsafe/restore-table-layer.mjs';
import {compileDefinitionLayer,rehearseDefinitionLayer} from '../../scripts/techsafe/restore-definition-layer.mjs';
import {compilePrivilegeLayer,rehearsePrivilegeLayer,decodeAcl} from '../../scripts/techsafe/restore-privilege-layer.mjs';
import {compileTriggerLayer,rehearseTriggerLayer} from '../../scripts/techsafe/restore-trigger-layer.mjs';
import {compileAccessLayer,rehearseAccessLayer} from '../../scripts/techsafe/restore-access-layer.mjs';
const source=new PGlite(),destination=new PGlite();
async function capture(db){const pages=[];for(const kind of captureKinds)for(let offset=0;;offset+=25){const rows=(await db.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;pages.push({kind,offset,rows});}return pages;}
try{
for(const db of [source,destination])await db.exec('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;');
await source.exec(`CREATE SCHEMA private;CREATE TABLE public.records(id integer,qty integer,price numeric,total numeric,secret text);CREATE TABLE public.audit(n integer);
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_api ON public.records FOR ALL TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY fixture_audit_read ON public.audit FOR SELECT TO authenticated USING(true);
CREATE FUNCTION private.math_value(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$SELECT $1*2$$;
REVOKE ALL ON FUNCTION private.math_value(integer) FROM PUBLIC;GRANT USAGE ON SCHEMA private TO authenticated;GRANT EXECUTE ON FUNCTION private.math_value(integer) TO authenticated;
REVOKE ALL ON TABLE public.records FROM PUBLIC;GRANT SELECT(id,qty,total),INSERT(id,qty,price) ON public.records TO authenticated;
GRANT SELECT ON public.audit TO authenticated WITH GRANT OPTION;
CREATE FUNCTION public.derive_total() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.total:=NEW.qty*NEW.price;RETURN NEW;END$$;
CREATE FUNCTION public.audit_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN INSERT INTO public.audit VALUES(NEW.id);RETURN NEW;END$$;
CREATE FUNCTION public.deferred_validate() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.qty<0 THEN RAISE EXCEPTION 'invalid quantity' USING ERRCODE='23514';END IF;RETURN NEW;END$$;
CREATE TRIGGER derive BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW EXECUTE FUNCTION public.derive_total();
CREATE TRIGGER audit AFTER INSERT ON public.records FOR EACH ROW EXECUTE FUNCTION public.audit_insert();
CREATE CONSTRAINT TRIGGER quantity_valid AFTER UPDATE ON public.records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.deferred_validate();`);
const pages=await capture(source),metadata=(await source.query(fs.readFileSync('scripts/techsafe/catalog-capture-metadata.sql','utf8'))).rows[0].metadata;
for(const item of compileTableLayer(pages).statements)await destination.exec(item.sql);
await rehearseDefinitionLayer(destination,compileDefinitionLayer(pages));
await rehearseAccessLayer(destination,compileAccessLayer(pages));
const aclPlan=compilePrivilegeLayer(pages,metadata),acls=await rehearsePrivilegeLayer(destination,aclPlan);assert.deepEqual(acls.failures,[]);
const triggerPlan=compileTriggerLayer(pages),triggers=await rehearseTriggerLayer(destination,triggerPlan);assert.deepEqual(triggers.failures,[]);
await destination.exec('INSERT INTO public.records(id,qty,price) VALUES(1,2,5)');
assert.equal((await destination.query('SELECT total FROM public.records')).rows[0].total,null);assert.equal((await destination.query('SELECT count(*)::int AS n FROM public.audit')).rows[0].n,0);
const restored=await capture(destination);
for(const page of pages.filter(p=>p.kind==='relations'))for(const row of page.rows){
 const original=JSON.parse(row.payload_text),target=JSON.parse(restored.flatMap(p=>p.kind==='relations'?p.rows:[]).find(r=>r.identity===row.identity).payload_text);
 const sorted=a=>(a??[]).slice().sort();assert.deepEqual(sorted(target.acl),sorted(original.acl));
 assert.deepEqual(target.columns.map(c=>c.acl),original.columns.map(c=>c.acl));
 assert.deepEqual((target.triggers??[]).map(t=>({...t,enabled:'O'})),original.triggers??[]);
}
for(const t of triggerPlan.triggers)await destination.exec(t.enableSql);
await destination.exec('SET ROLE authenticated;');
assert.equal((await destination.query('SELECT private.math_value(3) AS n')).rows[0].n,6);
await destination.exec('INSERT INTO public.records(id,qty,price) VALUES(2,3,5)');
assert.equal(Number((await destination.query('SELECT total FROM public.records WHERE id=2')).rows[0].total),15);
await assert.rejects(destination.query('SELECT secret FROM public.records'),e=>e.code==='42501');
await assert.rejects(destination.exec("INSERT INTO public.records(id,qty,price,secret) VALUES(3,1,5,'not permitted')"),e=>e.code==='42501');
await destination.exec('RESET ROLE;BEGIN;UPDATE public.records SET qty=-1 WHERE id=2;');
await assert.rejects(destination.exec('COMMIT;'),e=>e.code==='23514');
assert.equal((await destination.query('SELECT qty FROM public.records WHERE id=2')).rows[0].qty,3);
await destination.exec('SET ROLE anon;');await assert.rejects(destination.query('SELECT private.math_value(1)'),e=>e.code==='42501');await destination.exec('RESET ROLE;');
assert.throws(()=>decodeAcl(['unreviewed=X/postgres'],'FUNCTION','postgres'),/Unreviewed/);
assert.throws(()=>decodeAcl(['authenticated=Z/postgres'],'FUNCTION','postgres'),/Unsupported/);
assert.deepEqual(decodeAcl(['authenticated=r*/postgres'],'TABLE','postgres'),[{grantee:'authenticated',privilege:'SELECT',grantable:true}]);
const damaged=structuredClone(pages);damaged[0].rows[0].payload_text+=' ';assert.throws(()=>compileTriggerLayer(damaged),/hash mismatch/);assert.throws(()=>compilePrivilegeLayer(damaged,metadata),/hash mismatch/);
console.log('Privilege/trigger checks passed: table/column/schema/function ACLs and grant options, anonymous/column denial, disabled trigger installation, explicit enablement, calculated totals, audit effects and deferred constraint rollback. Native provider/default-ACL behavior remains outside this suite.');
}finally{await source.close();await destination.close();}
