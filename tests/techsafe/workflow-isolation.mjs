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
await db.exec('ALTER TABLE change_order_line_items ADD CONSTRAINT isolation_parent_fk FOREIGN KEY(change_order_id) REFERENCES change_orders(id)');
await db.exec(fs.readFileSync('supabase/migrations/20261030165226_techsafe_retry_safe_change_application.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261030173008_techsafe_detach_legacy_workflow_hooks.sql','utf8'));
const normalize=s=>s.replace(/\s+/g,' ').trim();
assert.deepEqual((await definitions()).map(r=>normalize(r.definition)),originalDefinitions.map(r=>normalize(r.definition)),'legacy function bodies and attributes must return to their original behavior');
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.change_orders'::regclass AND tgname LIKE 'invalidate_techsafe_%'")).rows[0].n,0);
// Simulate complete failure of Techsafe recording. MJV removal and rejection
// must still succeed because neither workflow calls the integration helpers.
await db.exec(`CREATE OR REPLACE FUNCTION techsafe_source.record_scope_removal(p_co uuid,p_co_line uuid,p_line uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Techsafe unavailable';END$$;
CREATE OR REPLACE FUNCTION techsafe_source.record_scope_restoration(p_co uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Techsafe unavailable';END$$;`);
await db.query('INSERT INTO proposal_line_items(id,proposal_id,organization_id) VALUES($1,$2,$3)',[id(100),proposal,org]);
await db.query("INSERT INTO change_orders(id,sales_order_id,organization_id,status) VALUES($1,$2,$3,'approved')",[id(200),order,org]);
await db.query("INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,proposal_line_item_id) VALUES($1,$2,$3,'remove',$4)",[id(1200),id(200),org,id(100)]);
async function call(sql,args){await db.exec('BEGIN');try{await db.query("SELECT set_config('test.actor',$1,true)",[user]);await db.exec('SET LOCAL ROLE authenticated');await db.query(sql,args);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
await call('SELECT public.apply_change_order($1)',[id(200)]);
assert.equal((await db.query('SELECT is_hidden FROM proposal_line_items WHERE id=$1',[id(100)])).rows[0].is_hidden,true);
assert.equal((await db.query('SELECT techsafe_source.order_line_membership($1,$2) AS state',[order,id(100)])).rows[0].state,'unverified','missing evidence must withhold Techsafe certification');
await call('SELECT public.reject_change_order($1,$2)',[id(200),'Normal MJV rejection']);
assert.equal((await db.query('SELECT is_hidden FROM proposal_line_items WHERE id=$1',[id(100)])).rows[0].is_hidden,false);
assert.equal((await db.query('SELECT status FROM change_orders WHERE id=$1',[id(200)])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.applied_removals')).rows[0].n,0);
for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_table_privilege($1,'techsafe_source.applied_removals','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role])).rows[0].allowed,false);
console.log('Workflow isolation passed: original apply/reject definitions restored; removal/rejection succeed despite broken Techsafe helpers; uncertain equipment remains unverified; evidence stays private.');
}finally{await db.close();}
