import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=process.env.SALES_CREDIT_SQL || 'supabase/migrations/'+(await readdir('supabase/migrations')).find(n=>n.endsWith('_reliable_monthly_sales_credit.sql'));
try{
 await db.exec(await readFile('tests/sales-credit/schema.sql','utf8'));
 // A pre-existing transaction must not be silently attributed to today's owner.
 await db.query("INSERT INTO invoices(id,status) VALUES($1,'paid')",[id(999)]);
 await db.exec(await readFile(migration,'utf8'));
 await db.query('INSERT INTO organizations VALUES($1,$2),($3,$2)',[id(1),'America/Chicago',id(2)]);
 for(const [n,org,role,sales] of [[10,1,'sales_rep',true],[11,1,'sales_rep',true],[12,1,'sales_manager',false],[13,1,'technician',false],[14,1,'admin',false],[15,2,'sales_rep',true]])await db.query('INSERT INTO profiles VALUES($1,$2,$3,$4,$5,$6,true,$7)',[id(n),id(org),'Rep',String(n),'Rep '+n,sales,role]);
 await db.query("INSERT INTO contacts VALUES($1,$2,$3,'Customer',NULL),($4,$2,NULL,'Unassigned',NULL),($5,$6,$7,'Other org',NULL)",[id(20),id(1),id(10),id(21),id(22),id(2),id(15)]);
 const proposal=async(n,status='approved')=>db.query('INSERT INTO proposals VALUES($1,$2,$3,$4,100,110,10)',[id(n),id(1),id(20),status]);
 const order=async(n,p,status='planning')=>db.query('INSERT INTO sales_orders VALUES($1,$2,$3,$4,$5,$6,now(),110)',[id(n),id(1),id(11),id(20),id(p),status]);
 const credit=async(n)=>Number((await db.query('SELECT coalesce(sum(net_amount),0)total FROM sales_performance_credits WHERE source_id=$1',[id(n)])).rows[0].total);
 const events=async(n)=>(await db.query('SELECT * FROM sales_performance_credits WHERE source_id=$1',[id(n)])).rows;
 await proposal(30);await order(40,30);assert.equal(await credit(40),100);assert.equal((await events(40))[0].credited_rep_id,id(10));
 await db.query('UPDATE sales_orders SET contract_total=220 WHERE id=$1',[id(40)]);assert.equal(await credit(40),210);
 await db.query('UPDATE sales_orders SET contract_total=220 WHERE id=$1',[id(40)]);assert.equal((await events(40)).length,2);
 await db.query('UPDATE contacts SET assigned_to=$1 WHERE id=$2',[id(11),id(20)]);await db.query('UPDATE sales_orders SET contract_total=230 WHERE id=$1',[id(40)]);assert.ok((await events(40)).every(e=>e.credited_rep_id===id(10)));
 await db.query("UPDATE sales_orders SET status='cancelled' WHERE id=$1",[id(40)]);assert.equal(await credit(40),0);
 await db.query("UPDATE sales_orders SET status='active' WHERE id=$1",[id(40)]);assert.equal(await credit(40),220);
 await proposal(31,'designing');await order(41,31);assert.equal(await credit(41),0);await db.query("UPDATE proposals SET status='approved' WHERE id=$1",[id(31)]);assert.equal(await credit(41),100);
 await proposal(32,'approved_pending_action');await order(42,32,'pending_deposit');assert.equal(await credit(42),100);
 // Execute main's actual change-order recalc trigger alongside the new ledger.
 await db.exec('ALTER TABLE sales_orders ADD COLUMN original_contract_total numeric DEFAULT 110');
 const mainRecalc=await readFile('supabase/migrations/20261005180003_fix_contract_total_recalc_and_trigger.sql','utf8');
 await db.exec(mainRecalc.match(/CREATE OR REPLACE FUNCTION recalc_sales_order_contract_total\(\)[\s\S]*?\$\$;/)[0]);
 await db.exec('CREATE TRIGGER existing_recalc AFTER INSERT OR UPDATE OR DELETE ON change_orders FOR EACH ROW EXECUTE FUNCTION recalc_sales_order_contract_total()');
 await db.query("INSERT INTO sales_orders(id,organization_id,created_by,contact_id,proposal_id,status,booked_at,contract_total)VALUES($1,$2,$3,$4,$5,'active',now(),110)",[id(43),id(1),id(11),id(20),id(30)]);
 await db.query("INSERT INTO change_orders VALUES($1,$2,$3,'approved',true,50,5),($4,$2,$3,'approved',true,-20,2)",[id(110),id(1),id(43),id(111)]);assert.equal(await credit(43),130,'Signed CO tax is removed, approved net additions/reductions count once');
 await db.query("UPDATE change_orders SET is_billable=false WHERE id=$1",[id(110)]);assert.equal(await credit(43),80,'Nonbillable changes do not earn performance credit');
 const invoice=async(n,type='retail',amount=80,contact=20,status='sent')=>db.query("INSERT INTO invoices(id,organization_id,contact_id,invoice_type,status,invoice_date,subtotal,total,tax_amount) VALUES($1,$2,$3,$4,$5,CURRENT_DATE,$6::numeric,$6::numeric+8,8)",[id(n),id(1),id(contact),type,status,amount]);
 await invoice(50);assert.equal(await credit(50),80);await db.query('UPDATE invoices SET subtotal=40,total=48 WHERE id=$1',[id(50)]);assert.equal(await credit(50),40);
 await db.query("UPDATE invoices SET status='voided' WHERE id=$1",[id(50)]);assert.equal(await credit(50),0);await db.query("UPDATE invoices SET status='sent' WHERE id=$1",[id(50)]);assert.equal(await credit(50),40);
 await invoice(52,'retail',100,21);assert.equal((await events(52))[0].credited_rep_id,null);
 await db.query('INSERT INTO projects VALUES($1,$2,$3)',[id(80),id(1),id(40)]);await invoice(53,'retail',220);await db.query('UPDATE invoices SET project_id=$1 WHERE id=$2',[id(80),id(53)]);assert.equal(await credit(53),0);
 await invoice(54,'recurring',.01);await db.query('INSERT INTO recurring_subscriptions VALUES($1,$2,$3,$4,NULL,NULL),($5,$2,$3,$4,NULL,NULL),($6,$2,$3,$4,NULL,NULL)',[id(60),id(1),id(20),id(10),id(61),id(62)]);
 await db.exec(`BEGIN;INSERT INTO recurring_invoices VALUES('${id(70)}','${id(1)}','${id(60)}','${id(54)}',1),('${id(71)}','${id(1)}','${id(61)}','${id(54)}',1),('${id(72)}','${id(1)}','${id(62)}','${id(54)}',1);COMMIT;`);assert.equal(await credit(54),.01);
 await db.query('UPDATE invoices SET total=9.01,subtotal=1.01 WHERE id=$1',[id(54)]);assert.equal(await credit(54),1.01);
 await db.query('UPDATE contacts SET assigned_to=$1 WHERE id=$2',[id(10),id(20)]);await db.query('UPDATE invoices SET total=10.01,subtotal=2.01 WHERE id=$1',[id(54)]);assert.equal(await credit(54),2.01);assert.ok((await events(54)).every(e=>e.credited_rep_id===id(11)));
 await db.query("UPDATE invoices SET status='voided' WHERE id=$1",[id(54)]);assert.equal(await credit(54),0);await db.query("UPDATE invoices SET status='sent' WHERE id=$1",[id(54)]);assert.equal(await credit(54),2.01);
 await db.query('DELETE FROM recurring_invoices WHERE id=$1',[id(71)]);assert.equal(await credit(54),2.01);
 await assert.rejects(db.query('INSERT INTO recurring_invoices VALUES($1,$2,$3,$4,1)',[id(73),id(1),id(60),id(54)]),/Duplicate subscription/);
 await db.query('INSERT INTO security_contracts(id,organization_id,contact_id,created_by_user_id)VALUES($1,$2,$3,$4)',[id(90),id(1),id(20),id(11)]);await db.query('INSERT INTO security_billing_cycles VALUES($1,$2,$3)',[id(91),id(1),id(90)]);
 await db.query('UPDATE contacts SET assigned_to=$1 WHERE id=$2',[id(11),id(20)]);await invoice(55,'recurring',100);await db.query('UPDATE invoices SET security_billing_cycle_id=$1 WHERE id=$2',[id(91),id(55)]);assert.equal(await credit(55),100);assert.equal((await events(55))[0].credited_rep_id,id(10));
 await db.query("UPDATE invoices SET organization_id=$1,contact_id=$2,invoice_type='retail',total=100,tax_amount=0 WHERE id=$3",[id(1),id(20),id(999)]);assert.equal(await credit(999),0,'No unreviewed historical ownership backfill');
 // Reconcile separate subscription-link transactions without double-crediting.
 await invoice(56,'recurring',100);await db.query('INSERT INTO recurring_invoices VALUES($1,$2,$3,$4,1)',[id(74),id(1),id(60),id(56)]);assert.equal(await credit(56),100);
 await db.query('INSERT INTO recurring_invoices VALUES($1,$2,$3,$4,1)',[id(75),id(1),id(61),id(56)]);assert.equal(await credit(56),100);
 await assert.rejects(db.query('UPDATE invoices SET contact_id=$1 WHERE id=$2',[id(21),id(50)]),/identity is immutable/);
 await db.query('DELETE FROM invoices WHERE id=$1',[id(56)]);assert.equal(await credit(56),0,'Deleting a posted source leaves traceable compensating entries');
 await invoice(57,'service',800);assert.equal(await credit(57),800,'Standalone service invoice qualifies for customer-owner credit');
 await db.exec('ALTER TABLE invoices DROP COLUMN work_order_billing_request_id');await invoice(58,'retail',50);assert.equal(await credit(58),50,'Optional legacy invoice columns are read through JSON');
 await assert.rejects(db.exec('UPDATE sales_performance_credits SET net_amount=1'),/immutable/);
 await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('test.uid',$1,false)",[id(10)]);
 await assert.rejects(db.query('SELECT * FROM sales_performance_credits'),/permission denied/);await assert.rejects(db.query('SELECT sales_credit_private.invoice_total($1)',[id(50)]),/permission denied/);
 await assert.rejects(db.query("SELECT get_sales_performance('month',$1)",[id(11)]),/Own sales history only/);await assert.rejects(db.query("SELECT get_sales_performance('month',NULL)"),/Own sales history only/);
 const board=(await db.query('SELECT get_current_month_sales_competition()result')).rows[0].result;assert.equal(board.leaderboard.length,2);for(const e of board.leaderboard)assert.deepEqual(Object.keys(e).sort(),['isCurrentUser','monthlyTotal','rank','repDisplayName']);
 await db.query("SELECT set_config('test.uid',$1,false)",[id(12)]);const report=(await db.query("SELECT get_sales_performance('month',NULL)result")).rows[0].result;
 await assert.rejects(db.query("SELECT get_sales_performance('month',NULL,0,NULL)"),/Invalid performance page/);await assert.rejects(db.query("SELECT get_sales_performance(NULL,NULL)"),/Invalid performance period/);assert.ok(report.count>0);assert.equal(report.unassignedTotal,100);
 await assert.rejects(db.query("SELECT get_sales_performance('month',$1)",[id(15)]),/unavailable/);await db.query("SELECT set_config('test.module','denied',false)");await assert.rejects(db.query('SELECT get_current_month_sales_competition()'),/access required/);
 await db.query("SELECT set_config('test.module','allowed',false)");await db.query("SELECT set_config('test.uid',$1,false)",[id(13)]);await assert.rejects(db.query('SELECT get_current_month_sales_competition()'),/access required/);
 await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(db.query('SELECT get_current_month_sales_competition()'),/permission denied/);await db.exec('RESET ROLE');
 for(const [instant,expected]of[['2026-11-01T04:59:59Z','2026-10-01T05:00:00.000Z'],['2026-11-01T05:00:00Z','2026-11-01T05:00:00.000Z'],['2026-12-01T06:00:00Z','2026-12-01T06:00:00.000Z']]){const b=(await db.query("SELECT * FROM sales_credit_private.period_bounds('month','America/Chicago',$1)",[instant])).rows[0];assert.equal(b.start_at.toISOString(),expected);}
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='sales_credit_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows[0].n,0);
 console.log('PASS: before-tax booking, delayed approvals, corrections, cancellation/resubmission, immutable owners, standalone/project deduplication, recurring penny allocation, security origins, legacy exclusion, role/tenant/module privacy and local/DST periods.');
}finally{await db.close();}
