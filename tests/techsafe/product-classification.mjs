import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const org='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const editor='20000000-0000-0000-0000-000000000001',viewer='20000000-0000-0000-0000-000000000002',inactive='20000000-0000-0000-0000-000000000003';
const id=n=>'30000000-0000-0000-0000-'+String(n).padStart(12,'0');
try{
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
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
const classification=async n=>(await db.query('SELECT * FROM techsafe_source.product_classifications WHERE product_id=$1',[id(n)])).rows[0];
const before=await product(1);
await db.exec(fs.readFileSync('supabase/migrations/20261030155403_techsafe_product_classification.sql','utf8'));
assert.deepEqual(await product(1),before,'migration must not fire any catalog update triggers');
assert.equal((await classification(1)).product_kind,'miscellaneous');assert.equal((await classification(3)).miscellaneous_placeholder,true);
assert.equal(await classification(2),undefined,'normal equipment defaults to unclassified, never inferred from price/category');
async function as(actor,sql,params=[]){
 await db.exec('BEGIN');
 try{await db.query("SELECT set_config('test.actor',$1,true)",[actor]);await db.exec('SET LOCAL ROLE authenticated');const r=await db.query(sql,params);await db.exec('COMMIT');return r;}
 catch(e){await db.exec('ROLLBACK');throw e;}
}
const classify=(actor,n,kind)=>as(actor,'SELECT public.classify_techsafe_product($1,$2) AS data',[id(n),kind]);
for(const actor of [viewer,inactive,''])await assert.rejects(classify(actor,2,'equipment'),e=>e.code==='42501');
await assert.rejects(classify(editor,3,'equipment'),e=>e.code==='42501');
await assert.rejects(classify(editor,999,'equipment'),e=>e.code==='42501');
await assert.rejects(classify(editor,2,'made-up'),e=>e.code==='22023');
const realBefore=await product(2);
const result=await classify(editor,2,'equipment');
assert.equal(result.rows[0].data.product_kind,'equipment');
assert.equal(result.rows[0].data.updated_by,editor);
assert.deepEqual(await product(2),realBefore,'classification must not recalculate price or touch catalog tracking');
await assert.rejects(classify(editor,1,'equipment'),e=>e.code==='22023');
await as(editor,"UPDATE products SET name='Luxury television',sku='TV-5000' WHERE id=$1",[id(1)]);
assert.equal((await classification(1)).product_kind,'miscellaneous');
await assert.rejects(classify(editor,1,'unclassified'),e=>e.code==='22023');
await as(editor,"INSERT INTO products(id,organization_id,name,sku,item_type,unit_price) VALUES($1,$2,'Custom description',' misc-item ','material',5000)",[id(4),org]);
assert.equal((await classification(4)).miscellaneous_placeholder,true);
await as(editor,"INSERT INTO products(id,organization_id,name,sku,item_type,unit_price) VALUES($1,$2,'New product','NEW','material',100)",[id(5),org]);
assert.equal(await classification(5),undefined);
await classify(editor,5,'miscellaneous');
await assert.rejects(classify(editor,5,'equipment'),e=>e.code==='22023');
// Deleting/recreating an unused catalog row cannot reset source identity.
await as(editor,'DELETE FROM products WHERE id=$1',[id(4)]);
assert.equal((await classification(4)).miscellaneous_placeholder,true);
await as(editor,"INSERT INTO products(id,organization_id,name,sku) VALUES($1,$2,'Renamed replacement','REPLACEMENT')",[id(4),org]);
await assert.rejects(classify(editor,4,'equipment'),e=>e.code==='22023');
await assert.rejects(as(editor,'UPDATE products SET organization_id=$2 WHERE id=$1',[id(2),other]),e=>e.code==='42501');
await assert.rejects(as(viewer,"INSERT INTO products(id,organization_id,name,sku) VALUES($1,$2,'Miscellaneous Item','MISC-ITEM')",[id(6),org]),e=>e.code==='42501');
// Reclassification never grants direct registry or trigger access.
for(const role of ['anon','authenticated']){
 const rights=await db.query("SELECT has_table_privilege($1,'techsafe_source.product_classifications','SELECT,INSERT,UPDATE,DELETE') AS table_access,has_function_privilege($1,'techsafe_source.track_miscellaneous_product()','EXECUTE') AS trigger_access",[role]);
 assert.deepEqual(rights.rows[0],{table_access:false,trigger_access:false});
}
await assert.rejects(as(editor,'SELECT * FROM techsafe_source.product_classifications'),e=>e.code==='42501');
const rls=await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='techsafe_source.product_classifications'::regclass");assert.equal(rls.rows[0].relrowsecurity,true);
await db.exec('SET ROLE anon');
await assert.rejects(db.query('SELECT public.classify_techsafe_product($1,$2)',[id(2),'equipment']),e=>e.code==='42501');
await db.exec('RESET ROLE');
console.log('Techsafe classification passed: no catalog trigger side effects, legacy/new/renamed/recreated miscellaneous identities, conservative defaults, active editor permissions, inactive/anonymous/cross-tenant denial, invalid kinds, private grants and RLS.');
}finally{await db.close();}
