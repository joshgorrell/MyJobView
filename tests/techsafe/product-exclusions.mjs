import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const org='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const editor='20000000-0000-0000-0000-000000000001',viewer='20000000-0000-0000-0000-000000000002',inactive='20000000-0000-0000-0000-000000000003';
const id=n=>'30000000-0000-0000-0000-'+String(n).padStart(12,'0');
try{
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,is_active boolean,can_edit_products boolean);
INSERT INTO profiles VALUES ('${editor}','${org}','sales',true,true),('${viewer}','${org}','sales',true,false),('${inactive}','${org}','admin',false,true);
CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid,name text,sku text,category text,item_type text,unit_price numeric,is_active boolean DEFAULT true,tracking_counter integer DEFAULT 0);
INSERT INTO products(id,organization_id,name,sku,category,item_type,unit_price) VALUES
('${id(1)}','${org}','Miscellaneous Item','MISC-ITEM','Misc','material',5000),
('${id(2)}','${org}','Television','TV','Misc','material',2500),
('${id(3)}','${other}','Miscellaneous Item','MISC-ITEM','Misc','material',5000);
CREATE FUNCTION catalog_update_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.tracking_counter:=OLD.tracking_counter+1;NEW.unit_price:=NEW.unit_price+1;RETURN NEW;END$$;
CREATE TRIGGER catalog_update_side_effect BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION catalog_update_side_effect();
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_products ON products TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid())) WITH CHECK(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));
GRANT USAGE ON SCHEMA auth TO authenticated;GRANT SELECT ON profiles TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON products TO authenticated;`);
const product=async n=>(await db.query('SELECT * FROM products WHERE id=$1',[id(n)])).rows[0];
const registry=async n=>(await db.query('SELECT * FROM techsafe_source.product_exclusions WHERE product_id=$1',[id(n)])).rows[0];
const before=await product(1);
await db.exec(fs.readFileSync('supabase/migrations/20261030162612_techsafe_product_exclusions.sql','utf8'));
assert.deepEqual(await product(1),before,'migration must not fire catalog triggers');
assert.equal((await registry(1)).excluded,true);assert.equal((await registry(3)).miscellaneous_placeholder,true);
assert.equal(await registry(2),undefined,'no new classification requirement for ordinary catalog products');
async function as(actor,sql,params=[]){
 await db.exec('BEGIN');
 try{await db.query("SELECT set_config('test.actor',$1,true)",[actor]);await db.exec('SET LOCAL ROLE authenticated');const r=await db.query(sql,params);await db.exec('COMMIT');return r;}
 catch(e){await db.exec('ROLLBACK');throw e;}
}
const set=(actor,n,value)=>as(actor,'SELECT public.set_techsafe_product_exclusion($1,$2) AS data',[id(n),value]);
const get=(actor,n)=>as(actor,'SELECT public.get_techsafe_product_exclusion($1) AS data',[id(n)]);
assert.deepEqual((await get(viewer,2)).rows[0].data,{available:false});
await assert.rejects(set(editor,2,true),e=>e.code==='55000');
await db.query("INSERT INTO techsafe_source.integration_connections(organization_id,connection_id,enabled,status,last_verified_at) VALUES($1,$2,true,'active',now())",[org,id(50)]);
assert.deepEqual((await get(viewer,2)).rows[0].data,{available:true,product_id:id(2),excluded:false,automatic:false});
assert.equal((await get(viewer,1)).rows[0].data.automatic,true);
for(const actor of [viewer,inactive,''])await assert.rejects(set(actor,2,true),e=>e.code==='42501');
await assert.rejects(get(inactive,2),e=>e.code==='42501');
await assert.rejects(get(editor,3),e=>e.code==='42501');
await assert.rejects(set(editor,3,true),e=>e.code==='42501');
await assert.rejects(set(editor,999,true),e=>e.code==='42501');
await assert.rejects(set(editor,2,null),e=>e.code==='22023');
const original=await product(2);
assert.equal((await set(editor,2,true)).rows[0].data.excluded,true);
assert.equal((await registry(2)).updated_by,editor);
assert.deepEqual(await product(2),original,'checkbox does not recalculate prices or modify existing item_type');
assert.equal((await set(editor,2,false)).rows[0].data.excluded,false);
assert.deepEqual(await product(2),original);
for(const [enabled,status,verified] of [[false,'active','now()'],[true,'paused','now()'],[true,'revoked','now()'],[true,'disconnected','now()'],[true,'active',"now()-interval '6 minutes'"],[true,'active',"now()+interval '1 hour'"],[true,'active','NULL']]){
 await db.query('UPDATE techsafe_source.integration_connections SET enabled=$1,status=$2,last_verified_at='+verified+' WHERE organization_id=$3',[enabled,status,org]);
 assert.deepEqual((await get(editor,2)).rows[0].data,{available:false});
 await assert.rejects(set(editor,2,true),e=>e.code==='55000');
}
await db.query("UPDATE techsafe_source.integration_connections SET enabled=true,status='active',last_verified_at=now() WHERE organization_id=$1",[org]);
await assert.rejects(set(editor,1,false),e=>e.code==='22023');
await as(editor,"UPDATE products SET name='Luxury television',sku='TV-5000' WHERE id=$1",[id(1)]);
assert.equal((await get(editor,1)).rows[0].data.automatic,true);
await assert.rejects(set(editor,1,false),e=>e.code==='22023');
await as(editor,"INSERT INTO products(id,organization_id,name,sku,item_type,unit_price) VALUES($1,$2,'Custom description',' misc-item ','material',5000)",[id(4),org]);
assert.equal((await get(editor,4)).rows[0].data.excluded,true);
await as(editor,'DELETE FROM products WHERE id=$1',[id(4)]);
await as(editor,"INSERT INTO products(id,organization_id,name,sku) VALUES($1,$2,'Renamed replacement','REPLACEMENT')",[id(4),org]);
await assert.rejects(set(editor,4,false),e=>e.code==='22023');
await assert.rejects(as(editor,'UPDATE products SET organization_id=$2 WHERE id=$1',[id(2),other]),e=>e.code==='42501');
for(const role of ['anon','authenticated']){
 const rights=await db.query("SELECT has_table_privilege($1,'techsafe_source.product_exclusions','SELECT,INSERT,UPDATE,DELETE') AS table_access,has_function_privilege($1,'techsafe_source.track_miscellaneous_product()','EXECUTE') AS trigger_access",[role]);
 assert.deepEqual(rights.rows[0],{table_access:false,trigger_access:false});
}
await assert.rejects(as(editor,'SELECT * FROM techsafe_source.product_exclusions'),e=>e.code==='42501');
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='techsafe_source.product_exclusions'::regclass")).rows[0].relrowsecurity,true);
await db.exec('SET ROLE anon');
await assert.rejects(db.query('SELECT public.get_techsafe_product_exclusion($1)',[id(2)]),e=>e.code==='42501');
await assert.rejects(db.query('SELECT public.set_techsafe_product_exclusion($1,true)',[id(2)]),e=>e.code==='42501');
await db.exec('RESET ROLE');
console.log('Techsafe exclusions passed: optional checkbox, existing types unchanged, no catalog price/tracking side effects, automatic miscellaneous identities, editor/read-only/tenant permissions and private RLS/grants.');
}finally{await db.close();}
