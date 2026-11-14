import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createNativeDispatchHandler} from '../../supabase/functions/_shared/techsafe-native-dispatch-handler.mjs';
import {createSandboxInvocationHandler} from '../../supabase/functions/_shared/techsafe-sandbox-invocation.mjs';
const serverUrl=process.env.TECHSAFE_NATIVE_DELIVERY_TEST_DATABASE_URL;
let server;if(serverUrl){const {Client}=await import('pg');server=new Client({connectionString:serverUrl});await server.connect();}
const db=server?{query:(s,p)=>server.query(s,p),exec:s=>server.query(s),close:()=>server.end()}:new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [org,otherOrg,order,otherOrder,proposal,otherProposal,contact,product,connection,otherConnection]=[1,2,3,4,5,6,7,8,9,10].map(id);
const workerUrl='https://bqtsuzvuvqvgidipbsis.supabase.co/functions/v1/techsafe-dispatch-order';
const sql=async name=>db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
const queue=async()=> (await db.query('SELECT * FROM techsafe_source.native_delivery_queue WHERE connection_id=$1',[connection])).rows[0];
const tick=async()=>Number((await db.query('SELECT techsafe_source.run_native_delivery_queue() AS n')).rows[0].n);
const transport=async requestId=>(await db.query('SELECT * FROM net.http_request_queue WHERE id=$1',[requestId])).rows[0];
const incoming=row=>new Request(workerUrl,{method:'POST',headers:row.headers,body:JSON.stringify(row.body)});
const record=async(response,requestId)=>db.query('INSERT INTO net._http_response(id,status_code,content) VALUES($1,$2,$3)',[requestId,response.status,await response.text()]);
let leased=false,sends=0;
const pool={connect:async()=>{assert.equal(leased,false);leased=true;return {query:(s,p)=>db.query(s,p),release:()=>{leased=false;}};}};
const send=async scope=>{assert.equal(leased,false);assert.deepEqual(scope,{connectionId:connection,orderId:order});sends++;return {accepted:true,reason:'receiver_acknowledged',sourceRevision:'7',token:'never_return'};};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE SCHEMA techsafe_source;CREATE SCHEMA change_order_commit;CREATE SCHEMA net;CREATE SCHEMA extensions;CREATE SCHEMA cron;
  CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text);
  CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS
   $$INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) ON CONFLICT(jobname)
    DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING jobid$$;
  CREATE TABLE public.proposals(id uuid PRIMARY KEY,organization_id uuid,status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,contact_id uuid,status text);
  CREATE TABLE public.proposal_line_items(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,product_id uuid,unit_price numeric);
  CREATE TABLE public.change_orders(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,status text);
  CREATE TABLE public.change_order_line_items(id uuid PRIMARY KEY,organization_id uuid,change_order_id uuid REFERENCES public.change_orders(id) ON DELETE CASCADE);
  CREATE TABLE change_order_commit.revisions(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid);
  CREATE TABLE public.contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,contact_name text);
  CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid,name text,manufacturer text,model_number text,sku text,item_type text);
  CREATE TABLE net.http_request_queue(id bigserial PRIMARY KEY,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
  CREATE TABLE net._http_response(id bigint,status_code integer,content text,created timestamptz DEFAULT clock_timestamp());
  CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
   RETURNS bigint LANGUAGE sql AS $$INSERT INTO net.http_request_queue(url,body,headers,timeout_milliseconds) VALUES($1,$2,$4,$5) RETURNING id$$;`);
 // In-memory fixture transport/entropy only. Production uses pg_net and
 // pgcrypto; this suite never contacts a real endpoint or validates pricing.
 if(server)await db.exec('CREATE EXTENSION pgcrypto WITH SCHEMA extensions');
 else await db.exec(`CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE AS
  $$SELECT decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex')$$;`);
 await sql('20261108150000_techsafe_private_order_revision_ledger.sql');
 await sql('20261108160000_techsafe_exact_sales_order_binding_fks.sql');
 await sql('20261114155257_techsafe_sandbox_invocation_scope.sql');
 await db.exec('CREATE TABLE techsafe_source.native_approval_equipment_basis(sales_order_id uuid PRIMARY KEY REFERENCES public.sales_orders(id))');
 await sql('20261114152636_techsafe_preserve_native_sales_order_deletion.sql');
 await sql('20261114210904_techsafe_native_delivery_queue.sql');
 await sql('20261114211206_techsafe_native_delivery_schedule.sql');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM cron.job')).rows[0].n,1);
 await db.query("INSERT INTO public.proposals VALUES($1,$2,'approved'),($3,$4,'approved')",[proposal,org,otherProposal,otherOrg]);
 await db.query("INSERT INTO public.sales_orders VALUES($1,$2,$3,$4,'planning'),($5,$6,$7,$4,'planning')",[order,org,proposal,contact,otherOrder,otherOrg,otherProposal]);
 for(const [c,o,p,g] of [[connection,order,proposal,org],[otherConnection,otherOrder,otherProposal,otherOrg]])
  await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,organization_id,sales_order_id,proposal_id,status,enabled,dispatch_environment)
   VALUES($1,$2,$3,$4,'active',true,'sandbox')`,[c,g,o,p]);
 await db.query("UPDATE techsafe_source.integration_connections SET status='paused',enabled=false WHERE connection_id=$1",[otherConnection]);
 assert.equal(await tick(),0,'default configuration must not send');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM net.http_request_queue')).rows[0].n,0);
 const first=await queue();
 await db.exec('BEGIN');await db.query("UPDATE public.sales_orders SET status='active' WHERE id=$1",[order]);
 assert.ok(Number((await queue()).dirty_sequence)>Number(first.dirty_sequence));
 await db.exec('ROLLBACK');assert.equal(Number((await queue()).dirty_sequence),Number(first.dirty_sequence));
 await db.query('UPDATE techsafe_source.native_dispatch_settings SET enabled=true,worker_url=$1',[workerUrl]);
 if(server){
  const {Client}=await import('pg'),other=new Client({connectionString:serverUrl});await other.connect();
  await db.exec('BEGIN');
  try{assert.equal(await tick(),1);assert.equal(Number((await other.query('SELECT techsafe_source.run_native_delivery_queue() AS n')).rows[0].n),0,'overlapping schedulers may not duplicate claims');}
  finally{await db.exec('ROLLBACK');await other.end();}
 }
 assert.equal(await tick(),1);const initial=await queue();assert.ok(initial.request_id);assert.equal(await tick(),0,'one in-flight attempt per order');
 const request=await transport(initial.request_id);
 assert.equal(request.url,workerUrl);assert.deepEqual(request.body,{connectionId:connection,orderId:order});
 const run=createNativeDispatchHandler({pool,sendOrder:send,environment:'sandbox',enabled:true});
 assert.equal((await createSandboxInvocationHandler({pool,sendOrder:send,environment:'sandbox',enabled:true})(incoming(request))).status,403,'dispatch tickets do not grant sandbox-runner invocation');
 const production=createNativeDispatchHandler({pool,sendOrder:send,environment:'production',enabled:true});
 assert.equal((await production(incoming(request))).status,403,'a sandbox capability cannot enter production');
 const response=await run(incoming(request));assert.equal(response.status,200);
 assert.equal((await run(incoming(request))).status,403,'one-use dispatch capability cannot replay');
 await record(response,initial.request_id);
 await db.query("UPDATE public.sales_orders SET status='active' WHERE id=$1",[order]);
 assert.ok(Number((await queue()).dirty_sequence)>Number(initial.attempt_sequence));
 assert.equal(await tick(),1,'acknowledging an older attempt must schedule the later dirty version');
 const second=await queue();assert.equal(Number(second.acknowledged_sequence),Number(initial.attempt_sequence));
 assert.ok(Number(second.attempt_sequence)>Number(second.acknowledged_sequence));
 const req2=await transport(second.request_id),res2=await run(incoming(req2));assert.equal(res2.status,200);
 await record(res2,second.request_id);assert.equal(await tick(),0);
 assert.equal(Number((await queue()).acknowledged_sequence),Number((await queue()).dirty_sequence));
 // Missing credentials are not an acknowledgment. Retry is delayed and keeps
 // the dirty version; no new source approval is manufactured by the queue.
 await db.query("UPDATE public.sales_orders SET status='cancelled' WHERE id=$1",[order]);assert.equal(await tick(),1);
 const failure=await queue();
 const rejected=createNativeDispatchHandler({pool,environment:'sandbox',enabled:true,sendOrder:async()=>({accepted:false,reason:'credentials_unavailable'})});
 await record(await rejected(incoming(await transport(failure.request_id))),failure.request_id);
 assert.equal(await tick(),0);const backoff=await queue();assert.equal(backoff.last_result,'credentials_unavailable');
 assert.equal(Number(backoff.attempt_count),1);assert.ok(new Date(backoff.next_attempt_at)>new Date());
 assert.ok(Number(backoff.dirty_sequence)>Number(backoff.acknowledged_sequence));
 for(const [status,content] of [[200,JSON.stringify({accepted:true,reason:'receiver_acknowledged'})],
  [500,JSON.stringify({accepted:true,reason:'receiver_acknowledged',sourceRevision:'8'})],[200,'not-json']]){
  await db.query('UPDATE techsafe_source.native_delivery_queue SET next_attempt_at=now() WHERE connection_id=$1',[connection]);
  assert.equal(await tick(),1);const uncertain=await queue();
  await db.query('INSERT INTO net._http_response(id,status_code,content) VALUES($1,$2,$3)',[uncertain.request_id,status,content]);
  assert.equal(await tick(),0);
  assert.equal(Number((await queue()).acknowledged_sequence),Number(uncertain.acknowledged_sequence),'unverified worker response cannot acknowledge delivery');
 }
 await db.query('UPDATE techsafe_source.native_delivery_queue SET next_attempt_at=now() WHERE connection_id=$1',[connection]);
 assert.equal(await tick(),1);const lost=await queue();
 await db.query("UPDATE techsafe_source.native_delivery_queue SET lease_expires_at=now()-interval '1 minute' WHERE connection_id=$1",[connection]);
 assert.equal(await tick(),0);assert.equal((await queue()).last_result,'transport_unconfirmed');
 assert.equal((await run(incoming(await transport(lost.request_id)))).status,403,'late worker cannot consume an expired lease');
 // Paused and disabled settings refuse pending capabilities as well as claims.
 await db.query('UPDATE techsafe_source.native_delivery_queue SET next_attempt_at=now() WHERE connection_id=$1',[connection]);
 assert.equal(await tick(),1);const paused=await queue(),pausedRequest=await transport(paused.request_id);
 await db.query("UPDATE techsafe_source.integration_connections SET status='paused',enabled=false WHERE connection_id=$1",[connection]);
 assert.equal((await run(incoming(pausedRequest))).status,403);
 await db.query("UPDATE techsafe_source.integration_connections SET status='active',enabled=true,connection_generation=2 WHERE connection_id=$1",[connection]);
 assert.equal((await run(incoming(pausedRequest))).status,403,'credential generation change invalidates issued capabilities');
 await db.query('UPDATE techsafe_source.native_dispatch_settings SET enabled=false');assert.equal(await tick(),0);
 assert.equal((await run(incoming(pausedRequest))).status,403);
 // Catalog/customer events target only their actual scoped source orders.
 await db.query("INSERT INTO public.contacts VALUES($1,$2,'Fixture',null)",[contact,org]);
 await db.query("INSERT INTO public.products VALUES($1,$2,'Fixture',null,null,null,'material')",[product,org]);
 await db.query('INSERT INTO public.proposal_line_items VALUES($1,$2,$3,$4,500)',[id(11),org,proposal,product]);
 const before=Number((await queue()).dirty_sequence),otherBefore=Number((await db.query('SELECT dirty_sequence FROM techsafe_source.native_delivery_queue WHERE connection_id=$1',[otherConnection])).rows[0].dirty_sequence);
 await db.query("UPDATE public.contacts SET full_name='Changed Fixture' WHERE id=$1",[contact]);
 await db.query("UPDATE public.products SET model_number='New Model' WHERE id=$1",[product]);
 assert.ok(Number((await queue()).dirty_sequence)>before);
 assert.equal(Number((await db.query('SELECT dirty_sequence FROM techsafe_source.native_delivery_queue WHERE connection_id=$1',[otherConnection])).rows[0].dirty_sequence),otherBefore);
 // Integration queue storage must not restore the old native deletion block.
 const beforeDelete=Number((await queue()).dirty_sequence);
 await db.exec('BEGIN');await db.query('DELETE FROM public.sales_orders WHERE id=$1',[order]);
 assert.ok(Number((await queue()).dirty_sequence)>beforeDelete);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.deleted_sales_orders')).rows[0].n,1);
 await db.exec('ROLLBACK');assert.equal(Number((await queue()).dirty_sequence),beforeDelete);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.deleted_sales_orders')).rows[0].n,0);
 await db.query('DELETE FROM public.sales_orders WHERE id=$1',[order]);
 assert.ok(Number((await queue()).dirty_sequence)>beforeDelete);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.integration_connections WHERE connection_id=$1',[connection])).rows[0].n,1);
 // Unused connection-owned queue rows cascade, rollback and stay tenant scoped.
 await db.exec('BEGIN');await db.query('DELETE FROM techsafe_source.integration_connections WHERE connection_id=$1',[otherConnection]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_delivery_queue WHERE connection_id=$1',[otherConnection])).rows[0].n,0);
 assert.ok(await queue());await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_delivery_queue WHERE connection_id=$1',[otherConnection])).rows[0].n,1);
 await db.query('DELETE FROM techsafe_source.integration_connections WHERE connection_id=$1',[otherConnection]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sales_orders WHERE id=$1',[otherOrder])).rows[0].n,1);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM techsafe_source.native_delivery_queue'),/permission denied/);await db.exec('RESET ROLE');
 }
 console.log('PASS: atomic outbox, opt-in claims, one-use/environment authorization, stale-ack protection, retry/backoff, missing-response recovery and tenant isolation');
}catch(error){console.error(error.message,error.where??'',error.stack?.split('\n').slice(-3).join('\n'));process.exitCode=1;}finally{await db.close();}
