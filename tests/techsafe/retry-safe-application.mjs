import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),actor=id(3),outsider=id(4),order=id(10),proposal=id(20),product=id(30);
try{
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE SCHEMA techsafe_source;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean);INSERT INTO profiles VALUES('${actor}','${org}',true),('${outsider}','${other}',true);
CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid);INSERT INTO products VALUES('${product}','${org}'),('${id(31)}','${other}');
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,total numeric DEFAULT 0,calculation_count integer DEFAULT 0);INSERT INTO proposals(id,organization_id) VALUES('${proposal}','${org}');
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid);INSERT INTO sales_orders VALUES('${order}','${org}','${proposal}');
CREATE TABLE proposal_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid,product_id uuid,description text,quantity numeric,unit_price numeric,line_total numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,organization_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),is_hidden boolean DEFAULT false,labor_hours numeric,labor_rate numeric,labor_total numeric);
CREATE TABLE change_orders(id uuid PRIMARY KEY,sales_order_id uuid,organization_id uuid,status text,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now(),rejection_reason text);
CREATE TABLE change_order_line_items(id uuid PRIMARY KEY,change_order_id uuid REFERENCES change_orders(id) ON DELETE CASCADE,organization_id uuid,action_type text,proposal_line_item_id uuid,product_id uuid,product_description text,product_name text,new_quantity numeric,new_unit_price numeric,is_taxable boolean,item_type text,labor_phase_id uuid,sort_order integer,created_at timestamptz DEFAULT now(),labor_hours numeric,labor_rate numeric,new_labor_total numeric);
CREATE FUNCTION calculate_proposal_totals(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN
 IF current_setting('test.fail_totals',true)='true' THEN RAISE EXCEPTION 'Test calculation failure';END IF;
 UPDATE public.proposals SET calculation_count=calculation_count+1,total=(SELECT coalesce(sum(line_total),0) FROM public.proposal_line_items WHERE proposal_id=p_id AND NOT is_hidden) WHERE id=p_id;
END$$;
CREATE FUNCTION public.reject_change_order(p_change_order_id uuid,p_rejection_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN
UPDATE proposal_line_items pli SET is_hidden=false WHERE pli.id IN(SELECT coli.proposal_line_item_id FROM change_order_line_items coli WHERE coli.change_order_id=p_change_order_id AND coli.action_type='remove' AND coli.proposal_line_item_id IS NOT NULL);
UPDATE change_orders SET status='rejected',rejection_reason=p_rejection_reason,is_active=false,updated_at=now() WHERE id=p_change_order_id;END;$$;`);
await db.exec(fs.readFileSync('supabase/migrations/20260326163627_fix_apply_change_order_correct_columns.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261030164022_techsafe_change_order_removal_provenance.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261030165226_techsafe_retry_safe_change_application.sql','utf8'));
await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
let nextLine=1000;
async function source(co,items,managed=true){
 await db.query("INSERT INTO change_orders(id,sales_order_id,organization_id,status) VALUES($1,$2,$3,'draft')",[id(co),order,org]);
 if(managed)await db.query('INSERT INTO techsafe_source.managed_change_orders(change_order_id,organization_id,sales_order_id) VALUES($1,$2,$3)',[id(co),org,order]);
 for(const item of items){const row={id:id(nextLine++),action_type:'add',proposal_line_item_id:null,product_id:product,product_name:'Same equipment',new_quantity:1,new_unit_price:500,labor_hours:null,labor_rate:null,new_labor_total:null,...item};
 await db.query('INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,proposal_line_item_id,product_id,product_name,new_quantity,new_unit_price,item_type,sort_order,labor_hours,labor_rate,new_labor_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,\'material\',$10,$11,$12,$13)',[row.id,id(co),org,row.action_type,row.proposal_line_item_id,row.product_id,row.product_name,row.new_quantity,row.new_unit_price,nextLine,row.labor_hours,row.labor_rate,row.new_labor_total]);}
 await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(co)]);
}
const apply=async co=>(await db.query('SELECT techsafe_source.apply_managed_change_order($1) AS result',[id(co)])).rows[0].result;
const row=async line=>(await db.query('SELECT * FROM proposal_line_items WHERE id=$1',[line])).rows[0];
const count=async()=>Number((await db.query('SELECT count(*) AS n FROM proposal_line_items')).rows[0].n);
await source(100,[{},{}]);const initial=await apply(100);
assert.equal(initial.lines.length,2);const first=initial.lines[0].proposal_line_id,second=initial.lines[1].proposal_line_id;
assert.notEqual(first,second,'identical additions must remain distinct source equipment');assert.equal(await count(),2);
await source(101,[{action_type:'modify_quantity',proposal_line_item_id:first,new_quantity:2}]);await apply(101);
await source(102,[{}]);const third=(await apply(102)).lines[0].proposal_line_id;
await source(103,[{action_type:'remove',proposal_line_item_id:second}]);await apply(103);
await source(104,[{action_type:'modify_price',proposal_line_item_id:first,new_unit_price:650}]);await apply(104);
await source(105,[{action_type:'modify_quantity',proposal_line_item_id:first,new_quantity:7}]);await apply(105);
await source(106,[{action_type:'modify_quantity',proposal_line_item_id:third,new_quantity:4}]);await apply(106);
await source(107,[{action_type:'modify_price',proposal_line_item_id:third,new_unit_price:700}]);await apply(107);
const totalsBefore=(await db.query('SELECT * FROM proposals WHERE id=$1',[proposal])).rows[0];
assert.equal((await apply(100)).application_status,'duplicate');assert.equal((await apply(101)).application_status,'duplicate');
assert.equal(await count(),3);assert.equal((await row(first)).quantity,'7');assert.equal((await row(first)).unit_price,'650');
assert.equal((await row(third)).quantity,'4');assert.equal((await row(third)).unit_price,'700');assert.equal((await row(second)).is_hidden,true);
assert.deepEqual((await db.query('SELECT * FROM proposals WHERE id=$1',[proposal])).rows[0],totalsBefore,'duplicate must not replay calculations');
assert.equal((await db.query('SELECT techsafe_source.order_line_membership($1,$2) AS state',[order,second])).rows[0].state,'removed');
assert.equal(Number((await db.query('SELECT count(*) AS n FROM techsafe_source.change_applications')).rows[0].n),8);
await source(108,[{action_type:'modify_labor',proposal_line_item_id:first,labor_hours:2,labor_rate:80,new_labor_total:160}]);await apply(108);assert.equal((await row(first)).labor_total,'160');
await source(109,[{}],false);await assert.rejects(apply(109),e=>e.code==='55000');
await source(110,[{product_id:id(31)}]);await assert.rejects(apply(110),e=>e.code==='42501');
await source(111,[{new_quantity:-1}]);await assert.rejects(apply(111),e=>e.code==='22023');
const beforeFailure=await count();await source(112,[{},{action_type:'modify_quantity',proposal_line_item_id:id(999),new_quantity:2}]);await assert.rejects(apply(112),e=>e.code==='42501');assert.equal(await count(),beforeFailure);
assert.equal(Number((await db.query('SELECT count(*) AS n FROM techsafe_source.change_application_lines WHERE change_order_id=$1',[id(112)])).rows[0].n),0);
await source(113,[{}]);await db.query("SELECT set_config('test.fail_totals','true',false)");await assert.rejects(apply(113));assert.equal(await count(),beforeFailure);
assert.equal((await db.query('SELECT is_active FROM change_orders WHERE id=$1',[id(113)])).rows[0].is_active,true);
await db.query("SELECT set_config('test.fail_totals','false',false)");await apply(113);assert.equal(await count(),beforeFailure+1);
await db.query("UPDATE change_order_line_items SET new_quantity=99 WHERE change_order_id=$1",[id(101)]);await assert.rejects(apply(101),e=>e.code==='22023');assert.equal((await row(first)).quantity,'7');
await db.query("UPDATE change_orders SET status='draft' WHERE id=$1",[id(100)]);await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(100)]);await assert.rejects(apply(100),e=>e.code==='22023');
await source(114,[{}]);await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);await assert.rejects(apply(114),e=>e.code==='42501');
await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
await source(115,[{action_type:'modify_labor',proposal_line_item_id:first,labor_hours:-1,labor_rate:80,new_labor_total:0}]);await assert.rejects(apply(115),e=>e.code==='22023');
await source(116,[{}]);await db.query('UPDATE change_orders SET status=NULL WHERE id=$1',[id(116)]);await assert.rejects(apply(116),e=>e.code==='22023');
for(const role of ['anon','authenticated']){
 const r=await db.query("SELECT has_function_privilege($1,'techsafe_source.apply_managed_change_order(uuid)','EXECUTE') AS execute",[role]);assert.equal(r.rows[0].execute,false);
 for(const table of ['managed_change_orders','change_applications','change_application_lines'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') AS allowed',[role,'techsafe_source.'+table])).rows[0].allowed,false);
}
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='techsafe_source' AND c.relname IN ('managed_change_orders','change_applications','change_application_lines') AND c.relrowsecurity")).rows[0].n,3);
console.log('Managed change application passed: eight COs, identical additions, stable mappings, harmless old retries, quantity/price/labor/removal, unregistered/foreign/invalid denial, transaction rollback, changed-payload/lifecycle conflicts and private permissions.');
}finally{await db.close();}
