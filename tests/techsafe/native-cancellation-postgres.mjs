import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createNativeCancellationSender} from '../../supabase/functions/_shared/techsafe-native-cancellation-sender.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [org,proposal,order,connection,otherOrg]=[1,2,3,4,5].map(id);
const request={connectionId:connection,orderId:order,endpoint:'https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import',token:'a'.repeat(48)};
let leased=false,opens=0,intercept=null,sends=0,last;
const pool={connect:async()=>{
 assert.equal(leased,false,'must release DB before opening another transaction');
 opens++;if(intercept)await intercept(opens);
 leased=true;
 return {query:(sql,params)=>db.query(sql,params),release:()=>{leased=false;}};
}};
const options={pool,sourceInstanceId:'mjv_test',environment:'sandbox',fetchImpl:async(url,init)=>{
 assert.equal(leased,false,'never hold source locks across HTTP');
 sends++;last=JSON.parse(init.body);
 assert.equal(last.messageType,'hold');assert.equal(last.reason,'source_unavailable');
 assert.equal(last.customerName,undefined);assert.equal(last.lines,undefined);
 return {status:200,json:async()=>({accepted:true,connectionId:connection,orderId:order,
  sourceRevision:String(last.revision),eventId:last.eventId,generation:last.generation})};
}};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,status text);
  CREATE TABLE public.proposals(id uuid PRIMARY KEY,organization_id uuid,status text);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261108150000_techsafe_private_order_revision_ledger.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261114145831_techsafe_negative_order_exports.sql',import.meta.url),'utf8'));
 await db.query("INSERT INTO public.proposals VALUES($1,$2,'approved')",[proposal,org]);
 await db.query("INSERT INTO public.sales_orders VALUES($1,$2,$3,'planning')",[order,org,proposal]);
 await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,organization_id,sales_order_id,
  proposal_id,status,enabled) VALUES($1,$2,$3,$4,'active',true)`,[connection,org,order,proposal]);
 const send=createNativeCancellationSender(options);
 assert.deepEqual(await send(request),{applicable:false});assert.equal(sends,0);
 await db.query("UPDATE public.sales_orders SET status='cancelled' WHERE id=$1",[order]);
 assert.equal((await send(request)).accepted,true);
 const first=structuredClone(last);assert.equal(first.revision,1);
 assert.equal((await send(request)).accepted,true);assert.deepEqual(last,first,'retry reuses durable revision/event');
 assert.equal(Number((await db.query('SELECT revision FROM techsafe_source.order_revision_ledger')).rows[0].revision),1);
 // Existing candidate revisions share ordering with cancellation holds.
 await db.exec("UPDATE techsafe_source.order_revision_ledger SET revision=7,state='candidate',hold_reason=NULL");
 assert.equal((await send(request)).accepted,true);assert.equal(last.revision,8);
 const sent=sends;
 await db.exec("UPDATE techsafe_source.integration_connections SET status='paused',enabled=false");
 assert.equal((await send(request)).accepted,false);assert.equal(sends,sent);
 await db.exec("UPDATE techsafe_source.integration_connections SET status='active',enabled=true");
 // A reopen between preparation and delivery blocks the prepared hold.
 const start=opens;intercept=async count=>{if(count===start+2)await db.exec("UPDATE public.sales_orders SET status='planning'");};
 assert.equal((await send(request)).reason,'cancellation_delivery_not_authorized');assert.equal(sends,sent);
 intercept=null;
 assert.deepEqual(await send(request),{applicable:false});
 // Proposal cancellation also blocks a still-open native Sales Order.
 await db.exec("UPDATE public.proposals SET status='cancelled'");
 assert.equal((await send(request)).accepted,true);assert.ok(last.revision>8);
 await db.query('UPDATE public.proposals SET organization_id=$1',[otherOrg]);
 assert.equal((await send(request)).accepted,false);
 await db.query('UPDATE public.proposals SET organization_id=$1',[org]);
 // Incorrect receipts cannot acknowledge a cancellation.
 const bad=createNativeCancellationSender({...options,fetchImpl:async()=>({status:200,json:async()=>({accepted:true})})});
 assert.equal((await bad(request)).reason,'receiver_receipt_unverified');
 const before=(await db.query('SELECT * FROM techsafe_source.negative_order_exports')).rows;
 await db.exec("UPDATE techsafe_source.order_revision_ledger SET revision=20,state='candidate',hold_reason=NULL");
 await db.exec(`CREATE FUNCTION public.reject_negative() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure';END$$;
  CREATE TRIGGER reject_negative BEFORE UPDATE ON techsafe_source.negative_order_exports FOR EACH ROW EXECUTE FUNCTION public.reject_negative();`);
 assert.equal((await send(request)).accepted,false);
 assert.equal(Number((await db.query('SELECT revision FROM techsafe_source.order_revision_ledger')).rows[0].revision),20,'failed persistence rolls back revision');
 assert.deepEqual((await db.query('SELECT * FROM techsafe_source.negative_order_exports')).rows,before);
 await db.exec('DROP TRIGGER reject_negative ON techsafe_source.negative_order_exports');
 await db.exec('SET ROLE authenticated');
 await assert.rejects(db.query('SELECT * FROM techsafe_source.negative_order_exports'),/permission denied/);
 await db.exec('RESET ROLE');
 // Retry rows are owned by their ledger; rollback restores both. Native sale
 // records and independent order history are never deleted by this cleanup.
 const otherOrder=id(6),otherProposal=id(7),otherConnection=id(8);
 await db.query("INSERT INTO public.proposals VALUES($1,$2,'approved')",[otherProposal,otherOrg]);
 await db.query("INSERT INTO public.sales_orders VALUES($1,$2,$3,'planning')",[otherOrder,otherOrg,otherProposal]);
 await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,organization_id,sales_order_id,
  proposal_id,status,enabled) VALUES($1,$2,$3,$4,'held',false)`,[otherConnection,otherOrg,otherOrder,otherProposal]);
 await db.query(`INSERT INTO techsafe_source.order_revision_ledger(connection_id,organization_id,sales_order_id,
  proposal_id,revision,connection_generation,source_fingerprint,state,hold_reason)
  VALUES($1,$2,$3,$4,1,1,$5,'held','fixture')`,[otherConnection,otherOrg,otherOrder,otherProposal,'0'.repeat(64)]);
 await db.query(`INSERT INTO techsafe_source.negative_order_exports VALUES($1,$2,'{}')`,[otherConnection,otherOrder]);
 await db.exec('BEGIN');await db.query('DELETE FROM techsafe_source.order_revision_ledger WHERE connection_id=$1',[connection]);
 assert.equal((await db.query('SELECT * FROM techsafe_source.negative_order_exports WHERE connection_id=$1',[connection])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM techsafe_source.negative_order_exports WHERE connection_id=$1',[otherConnection])).rows.length,1);
 await db.exec('ROLLBACK');
 assert.deepEqual((await db.query('SELECT * FROM techsafe_source.negative_order_exports WHERE connection_id=$1',[connection])).rows,before);
 await db.query('DELETE FROM techsafe_source.order_revision_ledger WHERE connection_id=$1',[connection]);
 assert.equal((await db.query('SELECT * FROM techsafe_source.negative_order_exports WHERE connection_id=$1',[connection])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM techsafe_source.negative_order_exports WHERE connection_id=$1',[otherConnection])).rows.length,1);
 assert.equal((await db.query('SELECT * FROM public.sales_orders')).rows.length,2);
 console.log('PASS: native cancellation hold delivery, shared revisions, stable retries, reopen race, scope denial, rollback and dependent cleanup');
}finally{await db.close();}
