import assert from 'node:assert/strict';import{Client}from'pg';
if(!process.env.CUSTOMER_DATABASE_URL)throw new Error('Disposable PostgreSQL connection required');
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const a=new Client({connectionString:process.env.CUSTOMER_DATABASE_URL}),b=new Client({connectionString:process.env.CUSTOMER_DATABASE_URL});await Promise.all([a.connect(),b.connect()]);
try{for(const c of[a,b])await c.query(`select set_config('test.uid','${id(12)}',false);set role authenticated`);
 const sql='select submit_customer_proposal_decision($1,2,$2,\'approve\',\'{"method":"payment"}\') result';
 const results=await Promise.all([a.query(sql,[id(107),id(907)]),b.query(sql,[id(107),id(907)])]);assert.deepEqual(results[0].rows,results[1].rows);
 await a.query('reset role');for(const table of['sales_orders','invoices','private.proposal_customer_decisions'])assert.equal(Number((await a.query(`select count(*) count from ${table} where proposal_id=$1`,[id(107)])).rows[0].count),1);
 assert.equal((await a.query('select deposit_paid from proposals where id=$1',[id(107)])).rows[0].deposit_paid,false);
 console.log('PostgreSQL concurrent approval retry creates one order, one unpaid invoice and one immutable receipt.');
}finally{await Promise.all([a.end(),b.end()]);}
