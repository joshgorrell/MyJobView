import assert from 'node:assert/strict';
import {finalizationDb,id,org,other,admin,pm,office,salesperson,inactive,outsider,order,proposal,product} from './fixtures/finalization-db.mjs';
const db=await finalizationDb();
try{
async function source(co,amount,options={}){
 const parent=options.order||order;
 await db.query("INSERT INTO change_orders(id,sales_order_id,organization_id,status,change_amount,tax_amount,is_billable,requires_customer_approval,customer_approved,tax_calculation_status) VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)",[id(co),parent,org,amount,options.tax||0,options.billable!==false,!!options.customer,!!options.customerFlag,options.taxReview?'review_required':'ready']);
 if(options.managed!==false)await db.query('INSERT INTO techsafe_source.managed_change_orders(change_order_id,organization_id,sales_order_id) VALUES($1,$2,$3)',[id(co),org,parent]);
 if(options.items!==false)await db.query("INSERT INTO change_order_line_items(id,change_order_id,organization_id,action_type,product_id,product_name,new_quantity,new_unit_price,item_type,sort_order) VALUES($1,$2,$3,'add',$4,'Equipment',1,$5,'material',1)",[id(co+10000),id(co),org,options.foreignProduct?id(31):product,Math.max(0,amount)]);
 for(const [index,role] of (options.approvals||[]).entries())await db.query('INSERT INTO change_order_approvals(id,change_order_id,organization_id,approval_level,approver_role) VALUES($1,$2,$3,$4,$5)',[id(co*10+index+1),id(co),org,index+1,role]);
 return id(co);
}
async function as(actor,sql,args=[]){await db.exec('BEGIN');try{await db.query("SELECT set_config('test.actor',$1,true)",[actor]);await db.exec('SET LOCAL ROLE authenticated');const r=await db.query(sql,args);await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
const finalize=async(actor,co,approval=null,notes=null,portal=null)=>(await as(actor,'SELECT public.finalize_managed_change_order($1,$2,$3,$4) AS result',[id(co),approval===null?null:id(approval),notes,portal])).rows[0].result;
const coRow=async co=>(await db.query('SELECT * FROM change_orders WHERE id=$1',[id(co)])).rows[0];
const approvalRow=async n=>(await db.query('SELECT * FROM change_order_approvals WHERE id=$1',[id(n)])).rows[0];
const count=async table=>Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
const contract=async()=>Number((await db.query('SELECT contract_total FROM sales_orders WHERE id=$1',[order])).rows[0].contract_total);
const visible=async()=>(await db.query('SELECT is_portal_visible FROM proposals WHERE id=$1',[proposal])).rows[0].is_portal_visible;
await source(100,500,{tax:50,approvals:['project_manager','office_manager']});
for(const actor of [salesperson,inactive,outsider,''])await assert.rejects(finalize(actor,100),e=>e.code==='42501');
await assert.rejects(finalize(pm,100,1002),e=>e.code==='42501');
await assert.rejects(finalize(office,100,1002),e=>e.code==='55000');
const pending=await finalize(pm,100,1001,'PM approved');assert.equal(pending.finalization_status,'awaiting_approvals');
assert.equal((await coRow(100)).status,'pending_approval');assert.equal((await approvalRow(1001)).approver_id,pm);assert.equal(await count('proposal_line_items'),0);assert.equal(await count('techsafe_source.finalization_outbox'),0);
assert.equal((await finalize(pm,100,1001,'PM approved')).finalization_status,'awaiting_approvals');
const first=await finalize(office,100,1002,'Office approved');assert.equal(first.finalization_status,'finalized');assert.equal(first.revision,1);assert.equal(await contract(),1550);
assert.equal((await coRow(100)).approved_by,office);assert.equal((await coRow(100)).is_locked,true);assert.equal(await count('proposal_line_items'),1);
assert.equal((await finalize(office,100,1002,'Office approved')).finalization_status,'duplicate');assert.equal(await count('techsafe_source.finalization_outbox'),1);
await assert.rejects(finalize(office,100,1002,'Changed request'),e=>e.code==='22023');
await source(101,100,{tax:10,billable:false});assert.equal((await finalize(admin,101)).revision,2);assert.equal(await contract(),1550);
await source(102,-200,{tax:-20,items:false});assert.equal((await finalize(admin,102)).revision,3);assert.equal(await contract(),1330);
await source(103,300,{tax:30,foreignProduct:true,approvals:['project_manager']});
const before=await count('proposal_line_items');await assert.rejects(finalize(pm,103,1031),e=>e.code==='42501');
assert.equal((await coRow(103)).status,'draft');assert.equal((await approvalRow(1031)).status,'pending');assert.equal(await contract(),1330);assert.equal(await count('proposal_line_items'),before);
await db.exec(`CREATE FUNCTION techsafe_source.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Test outbox failure';END$$;CREATE TRIGGER fail_outbox BEFORE INSERT ON techsafe_source.finalization_outbox FOR EACH ROW EXECUTE FUNCTION techsafe_source.fail_outbox();`);
await source(104,200,{approvals:['project_manager']});await assert.rejects(finalize(pm,104,1041));
assert.equal((await coRow(104)).status,'draft');assert.equal((await approvalRow(1041)).status,'pending');assert.equal(await contract(),1330);assert.equal(await count('proposal_line_items'),before);assert.equal(await count('techsafe_source.managed_finalizations'),3);
assert.equal((await db.query('SELECT revision FROM techsafe_source.managed_order_revisions WHERE sales_order_id=$1',[order])).rows[0].revision,3);
await db.exec('DROP TRIGGER fail_outbox ON techsafe_source.finalization_outbox');assert.equal((await finalize(pm,104,1041)).revision,4);
await source(105,100,{taxReview:true,approvals:['project_manager']});await assert.rejects(finalize(pm,105,1051),e=>e.code==='23514');assert.equal((await coRow(105)).status,'draft');assert.equal((await approvalRow(1051)).status,'pending');
await db.query('UPDATE proposals SET is_portal_visible=true WHERE id=$1',[proposal]);
await source(106,100,{approvals:['project_manager']});await assert.rejects(finalize(pm,106,1061),e=>e.code==='55000');assert.equal((await approvalRow(1061)).status,'pending');
assert.equal((await finalize(pm,106,1061,null,'keep')).revision,5);assert.equal(await visible(),true);
await source(107,100);assert.equal((await finalize(admin,107,null,null,'hide')).revision,6);assert.equal(await visible(),false);
await source(108,100,{customer:true,customerFlag:true});await assert.rejects(finalize(admin,108),e=>e.code==='55000');assert.equal((await coRow(108)).status,'draft');
await source(109,100,{approvals:['customer']});await assert.rejects(finalize(admin,109),e=>e.code==='55000');
await source(110,100,{managed:false});await assert.rejects(finalize(admin,110),e=>e.code==='55000');
await source(111,100);await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(111)]);await assert.rejects(finalize(admin,111),e=>e.code==='55000');
// Browser writes and spoofed client flags cannot forge managed approval.
await assert.rejects(as(admin,"UPDATE change_order_approvals SET status='approved' WHERE id=$1",[id(1051)]),e=>e.code==='42501');
await assert.rejects(as(admin,"UPDATE change_orders SET status='approved' WHERE id=$1",[id(105)]),e=>e.code==='42501');
await assert.rejects(as(admin,"UPDATE change_orders SET is_billable=false WHERE id=$1",[id(100)]),e=>e.code==='42501');
await assert.rejects(as(admin,"WITH flag AS MATERIALIZED (SELECT set_config('techsafe_source.finalizing','true',true)) UPDATE change_orders SET status='approved' FROM flag WHERE id='"+id(105)+"'"),e=>e.code==='42501');
assert.equal(await count('techsafe_source.managed_mutation_context'),0);
for(const name of ['public.apply_change_order(uuid)','public.reject_change_order(uuid,text)']){
 const body=(await db.query('SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure',[name])).rows[0].prosrc;
 assert.match(body,/\bBEGIN\s+PERFORM techsafe_source\.require_legacy_order_path\(p_change_order_id\);/);
}
// Both old application paths are blocked on an opted-in order.
await assert.rejects(as(admin,'SELECT public.apply_change_order($1)',[id(100)]),e=>e.code==='55000');
await assert.rejects(as(admin,'SELECT public.reject_change_order($1,$2)',[id(100),'Legacy rejection']),e=>e.code==='55000');
// Unmanaged orders retain the existing applier.
await db.query('INSERT INTO proposals(id,organization_id) VALUES($1,$2)',[id(501),org]);await db.query('INSERT INTO sales_orders(id,organization_id,proposal_id) VALUES($1,$2,$3)',[id(500),org,id(501)]);
await source(120,70,{managed:false,order:id(500)});await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(120)]);await as(admin,'SELECT public.apply_change_order($1)',[id(120)]);
assert.equal(Number((await db.query('SELECT count(*) AS n FROM proposal_line_items WHERE proposal_id=$1',[id(501)])).rows[0].n),1);
// No remote integration/health table is needed for source approval or queuing.
assert.equal((await db.query("SELECT to_regclass('techsafe_source.integration_connections') AS relation")).rows[0].relation,null);
assert.equal(await count('techsafe_source.finalization_outbox'),6);
for(const role of ['anon','authenticated'])for(const table of ['managed_order_revisions','managed_finalizations','finalization_outbox','managed_mutation_context'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') AS allowed',[role,'techsafe_source.'+table])).rows[0].allowed,false);
await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT public.finalize_managed_change_order($1)',[id(100)]),e=>e.code==='42501');await db.exec('RESET ROLE');
console.log('Atomic finalization passed: sequential role approvals, retry, billable/nonbillable/credit totals, equipment/tax/outbox rollback, portal decision, customer-evidence gate, private events and legacy-path isolation.');
}finally{await db.close();}
