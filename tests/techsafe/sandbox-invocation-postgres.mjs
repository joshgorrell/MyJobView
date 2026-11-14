import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createSandboxInvocationHandler} from '../../supabase/functions/_shared/techsafe-sandbox-invocation.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [connection,order,org,proposal,otherOrder]=[1,2,3,4,5].map(id);
const token='a'.repeat(64),digest=v=>createHash('sha256').update(v).digest('hex');
let leased=false,sends=0;
const pool={connect:async()=>{assert.equal(leased,false);leased=true;
 return {query:(s,p)=>db.query(s,p),release:()=>{leased=false;}};}};
const options={pool,environment:'sandbox',enabled:true,sendOrder:async input=>{
 assert.equal(leased,false,'ticket SQL session must be released before native sender');
 assert.deepEqual(input,{connectionId:connection,orderId:order});sends++;
 return {accepted:true,reason:'receiver_acknowledged',sourceRevision:'4',secret:'must not escape'};
}};
const request=(key=token,input={connectionId:connection,orderId:order},extra={})=>new Request('https://runner.test/check',{
 method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(input),...extra});
const issue=async changes=>{
 await db.exec('DELETE FROM techsafe_source.native_invocation_tickets');
 await db.query(`INSERT INTO techsafe_source.native_invocation_tickets
  (token_hash,connection_id,sales_order_id,connection_generation,issued_at,expires_at,purpose)
  VALUES($1,$2,$3,$4,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 minute',$5)`,
  [digest(token),connection,changes?.order??order,changes?.generation??1,changes?.purpose===null?null:'sandbox_send']);
};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261108150000_techsafe_private_order_revision_ledger.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261114155257_techsafe_sandbox_invocation_scope.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO public.sales_orders VALUES($1)',[order]);
 await db.query(`INSERT INTO techsafe_source.integration_connections
  (connection_id,sales_order_id,organization_id,proposal_id,status,enabled)
  VALUES($1,$2,$3,$4,'active',true)`,[connection,order,org,proposal]);
 const run=createSandboxInvocationHandler(options);
 await issue();
 for(const overrides of [{environment:'production'},{enabled:false}])
  assert.equal((await createSandboxInvocationHandler({...options,...overrides})(request())).status,503);
 assert.equal((await run(request('b'.repeat(64)))).status,403);
 assert.equal((await run(request(token,{connectionId:connection,orderId:order,endpoint:'https://evil.test'}))).status,400);
 assert.equal((await run(request(token,{}, {body:'{invalid'}))).status,400);
 assert.equal((await run(request(token,{}, {body:JSON.stringify({padding:'x'.repeat(5000)})}))).status,400);
 assert.equal((await run(request(token,{connectionId:connection,orderId:otherOrder}))).status,403);
 assert.equal((await run(request(token,{}, {method:'GET',body:undefined}))).status,405);
 const success=await run(request());assert.equal(success.status,200);
 assert.deepEqual(await success.json(),{accepted:true,reason:'receiver_acknowledged',sourceRevision:'4'});
 assert.equal((await run(request())).status,403,'single-use capability cannot replay');assert.equal(sends,1);
 for(const changes of [{generation:2},{order:otherOrder},{purpose:null}]){
  await issue(changes);assert.equal((await run(request())).status,403);
 }
 await issue();await db.exec("UPDATE techsafe_source.native_invocation_tickets SET issued_at=now()-interval '3 minutes',expires_at=now()-interval '1 minute'");
 assert.equal((await run(request())).status,403);
 await issue();await db.exec("UPDATE techsafe_source.integration_connections SET status='paused',enabled=false");
 assert.equal((await run(request())).status,403);
 await db.exec("UPDATE techsafe_source.integration_connections SET status='active',enabled=true");
 // Atomic consumption is tested with concurrent callers against the real SQL.
 const concurrentPool={connect:async()=>({query:(s,p)=>db.query(s,p),release:()=>{}})};
 const concurrent=createSandboxInvocationHandler({...options,pool:concurrentPool});
 await issue();const responses=await Promise.all([concurrent(request()),concurrent(request())]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);
 await issue();
 const held=createSandboxInvocationHandler({...options,sendOrder:async()=>({accepted:false,reason:'native_approval_basis_missing'})});
 assert.equal((await held(request())).status,409,'a ticket is invocation permission, never source approval');
 assert.equal((await run(request())).status,403,'failed native send still consumes the capability');
 await issue();
 await db.exec(`CREATE FUNCTION public.reject_ticket_consumption() RETURNS trigger LANGUAGE plpgsql AS
  $$BEGIN RAISE EXCEPTION 'fixture private error'; END$$;
  CREATE TRIGGER reject_ticket_consumption BEFORE UPDATE ON techsafe_source.native_invocation_tickets
  FOR EACH ROW EXECUTE FUNCTION public.reject_ticket_consumption();`);
 const denied=await run(request());assert.equal(denied.status,403);
 assert.equal((await db.query('SELECT consumed_at FROM techsafe_source.native_invocation_tickets')).rows[0].consumed_at,null);
 assert.equal((await denied.text()).includes('fixture private error'),false);
 await db.exec('DROP TRIGGER reject_ticket_consumption ON techsafe_source.native_invocation_tickets');
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('SET ROLE '+role);
  await assert.rejects(db.query('SELECT * FROM techsafe_source.native_invocation_tickets'),/permission denied/);
  await db.exec('RESET ROLE');
 }
 console.log('PASS: sandbox-only invocation, scope, generation, expiry, atomic one-use, replay denial, private table and unchanged native holds');
}finally{await db.close();}
