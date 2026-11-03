import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export async function applicationObservationDb(){
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
await db.exec(`CREATE TABLE techsafe_source.integration_connections(organization_id uuid PRIMARY KEY,connection_id uuid,enabled boolean,status text);
INSERT INTO techsafe_source.integration_connections VALUES('${org}','${id(40)}',true,'active');`);
await db.exec(fs.readFileSync('supabase/migrations/20261030182910_techsafe_private_application_observations.sql','utf8'));
// Loading the migration must not attach anything to an existing workflow.
assert.deepEqual((await definitions()).map(r=>normalize(r.definition)),originalDefinitions.map(r=>normalize(r.definition)));
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%techsafe%'")).rows[0].n,0);
await db.exec(`CREATE FUNCTION techsafe_source.fail_observation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF (TG_OP='INSERT' AND current_setting('test.fail_observer',true)='begin') OR
    (TG_OP='UPDATE' AND current_setting('test.fail_observer',true)='finish') THEN RAISE EXCEPTION 'Observer unavailable';END IF;RETURN NEW;END$$;
CREATE TRIGGER test_fail_observation BEFORE INSERT OR UPDATE ON techsafe_source.application_observations FOR EACH ROW EXECUTE FUNCTION techsafe_source.fail_observation();
-- Test-only trusted harness. This is not installed by the migration.
CREATE FUNCTION public.test_observed_apply(p_co uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE observation uuid;BEGIN
 observation:=techsafe_source.try_begin_application_observation(p_co);
 PERFORM public.apply_change_order(p_co);
 RETURN techsafe_source.try_finish_application_observation(p_co,observation);
END$$;
REVOKE ALL ON FUNCTION public.test_observed_apply(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.test_observed_apply(uuid) TO authenticated;
CREATE FUNCTION public.calculate_proposal_totals(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN
 IF current_setting('test.fail_core',true)='true' THEN RAISE EXCEPTION 'Original calculation failed' USING ERRCODE='23514';END IF;END$$;`);
async function source(co){await db.query("INSERT INTO change_orders(id,sales_order_id,organization_id,status) VALUES($1,$2,$3,'approved')",[id(co),order,org]);await db.query("INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,product_id,product_name,new_quantity,new_unit_price,item_type) VALUES($1,$2,$3,'add',$4,$5,1,500,'material')",[id(co+1000),id(co),org,id(50),'Equipment '+co]);}
async function apply(co,fault='',core=false){await db.exec('BEGIN');try{await db.query("SELECT set_config('test.actor',$1,true),set_config('test.fail_observer',$2,true),set_config('test.fail_core',$3,true)",[user,fault,String(core)]);await db.exec('SET LOCAL ROLE authenticated');const r=await db.query('SELECT public.test_observed_apply($1) AS observation',[id(co)]);await db.exec('COMMIT');return r.rows[0].observation;}catch(e){await db.exec('ROLLBACK');throw e;}}
return {db,id,org,other,user,outsider,order,proposal,source,apply,definitions,normalize,originalDefinitions};
}catch(error){await db.close();throw error;}
}
