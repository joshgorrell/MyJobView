import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),user=id(3),outsider=id(4),order=id(10),proposal=id(20);
try{
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE SCHEMA techsafe_source;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean);
INSERT INTO profiles VALUES('${user}','${org}',true),('${outsider}','${other}',true);
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid);
CREATE TABLE proposal_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid,product_id uuid,description text,quantity numeric DEFAULT 1,unit_price numeric DEFAULT 500,line_total numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,organization_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),is_hidden boolean DEFAULT false,labor_hours numeric,labor_rate numeric,labor_total numeric);
CREATE TABLE change_orders(id uuid PRIMARY KEY,sales_order_id uuid,organization_id uuid,status text,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now(),rejection_reason text);
CREATE TABLE change_order_line_items(id uuid PRIMARY KEY,change_order_id uuid,organization_id uuid,action_type text,proposal_line_item_id uuid,product_id uuid,product_description text,product_name text,new_quantity numeric,new_unit_price numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,created_at timestamptz DEFAULT now(),labor_hours numeric,labor_rate numeric,new_labor_total numeric);
INSERT INTO proposals VALUES('${proposal}','${org}');INSERT INTO sales_orders VALUES('${order}','${org}','${proposal}');
CREATE FUNCTION public.reject_change_order(p_change_order_id uuid,p_rejection_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
UPDATE proposal_line_items pli SET is_hidden=false WHERE pli.id IN(SELECT coli.proposal_line_item_id FROM change_order_line_items coli WHERE coli.change_order_id=p_change_order_id AND coli.action_type='remove' AND coli.proposal_line_item_id IS NOT NULL);
UPDATE change_orders SET status='rejected',rejection_reason=p_rejection_reason,is_active=false,updated_at=now() WHERE id=p_change_order_id;
END;$$;`);
await db.exec(fs.readFileSync('supabase/migrations/20260326163627_fix_apply_change_order_correct_columns.sql','utf8'));
await db.exec('REVOKE ALL ON FUNCTION public.apply_change_order(uuid) FROM PUBLIC,anon;REVOKE ALL ON FUNCTION public.reject_change_order(uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.reject_change_order(uuid,text) TO authenticated;');
const definitions=async()=> (await db.query("SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid IN ('public.apply_change_order(uuid)'::regprocedure,'public.reject_change_order(uuid,text)'::regprocedure) ORDER BY proname")).rows;
const originalDefinitions=await definitions();
await db.exec(fs.readFileSync('supabase/migrations/20261030164022_techsafe_change_order_removal_provenance.sql','utf8'));
const updatedDefinitions=await definitions();
const normalize=s=>s.replace(/PERFORM techsafe_source\.record_scope_(removal|restoration)\([^;]+;/g,'').replace(/\s+/g,' ').trim();
assert.deepEqual(updatedDefinitions.map(r=>normalize(r.definition)),originalDefinitions.map(r=>normalize(r.definition)),'existing calculation and presentation code must only gain recording calls');
for(let n=100;n<106;n++)await db.query('INSERT INTO proposal_line_items(id,proposal_id,organization_id,is_hidden) VALUES($1,$2,$3,$4)',[id(n),proposal,org,n===100]);
async function source(co,line,status='approved',organization=org){
 await db.query('INSERT INTO change_orders(id,sales_order_id,organization_id,status) VALUES($1,$2,$3,$4)',[id(co),order,organization,status]);
 await db.query("INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,proposal_line_item_id) VALUES($1,$2,$3,'remove',$4)",[id(co+1000),id(co),organization,id(line)]);
}
async function call(actor,sql,args){await db.exec('BEGIN');try{await db.query("SELECT set_config('test.actor',$1,true)",[actor]);await db.exec('SET LOCAL ROLE authenticated');await db.query(sql,args);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
const apply=(co,actor=user)=>call(actor,'SELECT public.apply_change_order($1)',[id(co)]);
const reject=co=>call(user,'SELECT public.reject_change_order($1,$2)',[id(co),'Not proceeding']);
const membership=async line=>(await db.query('SELECT techsafe_source.order_line_membership($1,$2) AS state',[order,id(line)])).rows[0].state;
const hidden=async line=>(await db.query('SELECT is_hidden FROM proposal_line_items WHERE id=$1',[id(line)])).rows[0].is_hidden;
assert.equal(await membership(100),'included','portal-hidden equipment remains in scope');
await source(200,101);
assert.equal(await membership(101),'unverified','approved does not imply applied');
await apply(200);assert.equal(await membership(101),'removed');assert.equal(await hidden(101),true);
await apply(200);assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.applied_removals')).rows[0].n,1);
await db.query("UPDATE change_orders SET status='draft' WHERE id=$1",[id(200)]);assert.equal(await membership(101),'unverified');
await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(200)]);
await db.query("UPDATE change_order_line_items SET product_name='Changed source' WHERE id=$1",[id(1200)]);assert.equal(await membership(101),'unverified');
await apply(200);assert.equal(await membership(101),'removed');
await reject(200);assert.equal(await membership(101),'included');assert.equal(await hidden(101),false);
await source(201,102,'pending_approval');assert.equal(await membership(102),'included');await assert.rejects(apply(201));assert.equal(await hidden(102),false);
await source(202,102,'approved',other);await assert.rejects(apply(202),e=>e.code==='42501');assert.equal(await hidden(102),false,'invalid removal rolls catalog update back');
await source(203,103);await assert.rejects(apply(203,outsider),e=>e.code==='42501');assert.equal(await hidden(103),false);
await db.exec(`CREATE FUNCTION techsafe_source.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Test receipt failure';END$$;CREATE TRIGGER fail_receipt BEFORE INSERT ON techsafe_source.applied_removals FOR EACH ROW EXECUTE FUNCTION techsafe_source.fail_receipt();`);
await assert.rejects(apply(203));assert.equal(await hidden(103),false,'receipt and removal are one transaction');
await db.exec('DROP TRIGGER fail_receipt ON techsafe_source.applied_removals;DROP FUNCTION techsafe_source.fail_receipt()');
await apply(203);assert.equal(await membership(103),'removed');
await source(204,103);await apply(204);await reject(203);assert.equal(await membership(103),'unverified','conflicting restoration cannot silently certify scope');
await source(205,104);await apply(205);await db.query('DELETE FROM change_order_line_items WHERE id=$1',[id(1205)]);assert.equal(await membership(104),'unverified');
await assert.rejects(reject(205),e=>e.code==='22023');assert.equal(await hidden(104),true);
assert.equal(await membership(999),'unverified');
// Other branches of the established applier keep their current behavior.
await source(206,105);await db.query("UPDATE change_order_line_items SET action_type='modify_quantity',new_quantity=3 WHERE id=$1",[id(1206)]);await apply(206);
assert.equal((await db.query('SELECT quantity FROM proposal_line_items WHERE id=$1',[id(105)])).rows[0].quantity,'3');
await source(207,105);await db.query("UPDATE change_order_line_items SET action_type='modify_price',new_unit_price=750 WHERE id=$1",[id(1207)]);await apply(207);
assert.equal((await db.query('SELECT unit_price FROM proposal_line_items WHERE id=$1',[id(105)])).rows[0].unit_price,'750');
await source(208,105);await db.query("UPDATE change_order_line_items SET action_type='modify_labor',labor_hours=2,labor_rate=80,new_labor_total=160 WHERE id=$1",[id(1208)]);await apply(208);
assert.equal((await db.query('SELECT labor_total FROM proposal_line_items WHERE id=$1',[id(105)])).rows[0].labor_total,'160');
assert.equal(await membership(105),'included');
await source(209,105);await db.query("UPDATE change_order_line_items SET action_type='add',product_id=$2,product_name='Added equipment',new_quantity=1,new_unit_price=700,item_type='material' WHERE id=$1",[id(1209),id(500)]);await apply(209);
assert.equal((await db.query('SELECT count(*)::int AS n FROM proposal_line_items WHERE product_id=$1',[id(500)])).rows[0].n,1);
for(const role of ['anon','authenticated']){
 const r=await db.query("SELECT has_table_privilege($1,'techsafe_source.applied_removals','SELECT,INSERT,UPDATE,DELETE') AS table_access,has_function_privilege($1,'techsafe_source.record_scope_removal(uuid,uuid,uuid)','EXECUTE') AS helper_access,has_function_privilege($1,'techsafe_source.order_line_membership(uuid,uuid)','EXECUTE') AS read_access",[role]);
 assert.deepEqual(r.rows[0],{table_access:false,helper_access:false,read_access:false});
}
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='techsafe_source.applied_removals'::regclass")).rows[0].relrowsecurity,true);
console.log('Removal provenance passed: portal visibility, legacy uncertainty, successful application/retry/restoration, unlocked/edited/deleted source, pending changes, tenant validation, transaction rollback, conflicting actions and private RLS/grants.');
}finally{await db.close();}
