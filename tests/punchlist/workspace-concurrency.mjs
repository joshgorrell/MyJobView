import assert from 'node:assert/strict';
import {Client} from 'pg';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const connectionString=process.env.PROJECT_SUPPORT_DATABASE_URL;
if(!connectionString)throw Error('Disposable PostgreSQL required for real concurrency test');
const a=new Client({connectionString}),b=new Client({connectionString});
await Promise.all([a.connect(),b.connect()]);
try {
 for(const c of [a,b])await c.query(`select set_config('test.uid','${id(10)}',false);select set_config('test.org','${id(1)}',false);set role authenticated`);
 const tasks=[];for(let i=0;i<5;i++)tasks.push((await a.query(`select add_test_tune_adjustment('${id(52)}','Concurrent ${i}','Customer-safe ${i}') id`)).rows[0].id);
 const sql='select request_project_punchlist_visit($1,$2,$3) id';
 const results=await Promise.all([a.query(sql,[id(52),tasks.slice(0,3),id(400)]),b.query(sql,[id(52),tasks.slice(0,3),id(400)])]);
 assert.equal(results[0].rows[0].id,results[1].rows[0].id);
 const different=await Promise.allSettled([a.query(sql,[id(52),[tasks[3]],id(401)]),b.query(sql,[id(52),[tasks[3]],id(402)])]);
 assert.equal(different.filter(r=>r.status==='fulfilled').length,1);assert.equal(different.filter(r=>r.status==='rejected').length,1);
 await a.query('reset role');
 assert.equal(Number((await a.query('select count(*) n from project_punchlist_requests where task_id=any($1)',[tasks.slice(0,3)])).rows[0].n),3);
 assert.equal(Number((await a.query('select count(distinct request_id) n from project_punchlist_requests where task_id=any($1)',[tasks.slice(0,3)])).rows[0].n),1);
 assert.equal(Number((await a.query('select count(*) n from project_punchlist_requests where task_id=$1',[tasks[4]])).rows[0].n),0);
 console.log('PASS: real concurrent identical retries, conflicting submissions, one request for three selected items and untouched unselected task.');
}finally{await Promise.all([a.end(),b.end()]);}
