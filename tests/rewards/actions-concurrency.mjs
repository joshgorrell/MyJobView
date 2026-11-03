import assert from 'node:assert/strict';
import {Client} from 'pg';
const url=process.env.ACTION_REWARDS_DATABASE_URL;
if(!url)throw new Error('ACTION_REWARDS_DATABASE_URL is required; run the action fixture first in a fresh PostgreSQL database.');
const clients=[];async function connect(){const c=new Client({connectionString:url});await c.connect();clients.push(c);return c;}
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
try{
 const db=await connect(),a=await connect(),b=await connect();const org=id(1),rep=id(11),admin=id(10);
 await db.query("select set_config('test.uid',$1,false)",[admin]);await db.query('select save_employee_action_rewards(true,1,38,100,10000,100)');
 await db.query('update contacts set assigned_to=$1 where id=$2',[rep,id(30)]);
 await db.query("insert into invoices values($1,$3,$4,1100,100,'submitted'),($2,$3,$4,1100,100,'submitted')",[id(700),id(701),org,id(30)]);
 const balance=async()=>Number((await db.query('select points_earned from profiles where id=$1',[rep])).rows[0].points_earned);
 const before=await balance();const pay=(c,n,invoice,amount)=>c.query('insert into payments(id,organization_id,invoice_id,amount)values($1,$2,$3,$4)',[id(n),org,id(invoice),amount]);
 await Promise.all([pay(a,710,700,1100),pay(b,711,701,1100)]);assert.equal(await balance()-before,2000,'Shared employee account serializes different invoice payments');
 await db.query("insert into invoices values($1,$2,$3,1100,100,'submitted')",[id(702),org,id(30)]);
 await Promise.all([pay(a,712,702,1100),pay(b,713,702,1100)]);
 assert.equal(Number((await db.query('select sum(net_collected)n from private.employee_payment_reward_sources where invoice_id=$1',[id(702)])).rows[0].n),1000,'Overpayments cannot over-award');
 const job=(c,n)=>c.query("insert into time_entries(id,organization_id,technician_id,entry_date,clock_in,entry_type,project_id,work_classification,status)values($1,$2,$3,(now() at time zone 'America/Chicago')::date,now(),'project',$4,'project','submitted')",[id(n),org,rep,id(799)]);
 const beforeJob=await balance();await Promise.all([job(a,720),job(b,721)]);assert.equal(await balance()-beforeJob,38,'Concurrent return punches earn once');
 await db.query("insert into invoices values($1,$2,$3,1100,100,'submitted')",[id(703),org,id(30)]);
 await db.query("create function public.fail_action_award() returns trigger language plpgsql as $$begin if new.transaction_type='invoice_payment' then raise exception 'Injected ledger failure';end if;return new;end$$;create trigger fail_action before insert on points_transactions for each row execute function fail_action_award()");
 const beforeFailure=await balance();await assert.rejects(()=>pay(a,714,703,1100),/Injected ledger failure/);assert.equal(await balance(),beforeFailure);assert.equal(Number((await db.query('select count(*)n from payments where id=$1',[id(714)])).rows[0].n),0);assert.equal(Number((await db.query('select count(*)n from private.employee_payment_reward_sources where payment_id=$1',[id(714)])).rows[0].n),0,'Failure rolls back payment, source and balance together');
 await db.query('drop trigger fail_action on points_transactions');
 await db.query('insert into review_requests(id,organization_id,contact_id,review_completed)values($1,$2,$3,true)',[id(730),org,id(30)]);
 for(const c of[a,b])await c.query("select set_config('test.uid',$1,false)",[admin]);
 await Promise.all([a.query('select award_employee_review_points($1,$2,$3)',[id(730),rep,'Concurrent individual review 730']),b.query('select award_employee_review_points($1,$2,$3)',[id(730),rep,'Concurrent individual review 730'])]);
 assert.equal(Number((await db.query('select count(*)n from points_transactions where source_key=$1',['verified-review:'+id(730)])).rows[0].n),1);
 console.log('Action Rewards PostgreSQL concurrency: shared balance, same-invoice cap, job return punches, payment/ledger failure rollback and identical review retries passed.');
}finally{await Promise.all(clients.map(c=>c.end()));}
