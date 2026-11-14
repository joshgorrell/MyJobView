import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeApprovalBasisVerifier} from '../../src/lib/techsafe/postgresNativeApprovalBasis.mjs';
const db=new PGlite();
const ids=Array.from({length:15},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [org,otherOrg,proposal,order,contact,line,product,oldProposal,oldOrder,oldLine,co]=ids;
const scope={orderId:order,organizationId:org,proposalId:proposal};
try{
 await db.exec(`CREATE SCHEMA techsafe_source;
 CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
 CREATE TABLE public.proposals(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,contact_id uuid,status text,approved_at timestamptz,approval_completed_at timestamptz);
 CREATE TABLE public.sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,contact_id uuid,created_at timestamptz DEFAULT now(),first_completion_date timestamptz,status text DEFAULT 'planning');
 CREATE TABLE public.proposal_line_items(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,product_id uuid,description text,item_type text,quantity numeric,unit_price numeric,line_total numeric,labor_total numeric,is_customer_supplied boolean,internal_cost numeric);
 CREATE TABLE public.change_orders(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,status text);`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261109183000_techsafe_equipment_certificate_storage.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261113152226_techsafe_native_approval_basis.sql',import.meta.url),'utf8'));
 // Historical approved orders never acquire retrospective evidence.
 await db.query(`INSERT INTO public.proposals VALUES($1,$2,$3,$4,'approved',now()-interval '1 day',null)`,[oldProposal,org,oldOrder,contact]);
 await db.query(`INSERT INTO public.sales_orders VALUES($1,$2,$3,$4,now()-interval '1 day')`,[oldOrder,org,oldProposal,contact]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_approval_equipment_basis')).rows[0].n,0);
 await db.query(`UPDATE public.proposals SET status='draft' WHERE id=$1`,[oldProposal]);
 await db.exec('BEGIN');
 await db.query(`UPDATE public.proposals SET status='approved',approved_at=now() WHERE id=$1`,[oldProposal]);
 await db.exec('COMMIT');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_approval_equipment_basis')).rows[0].n,0);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261114115511_techsafe_sales_order_completion_clock.sql',import.meta.url),'utf8'));
 // Native transaction: approval may precede order/line creation; deferred
 // capture must see the final committed rows rather than the partial state.
 await db.exec('BEGIN');
 await db.query(`INSERT INTO public.proposals VALUES($1,$2,null,$3,'draft',null,null)`,[proposal,org,contact]);
 await db.query(`UPDATE public.proposals SET status='approved',approved_at=now(),sales_order_id=$2 WHERE id=$1`,[proposal,order]);
 await db.query(`INSERT INTO public.sales_orders(id,organization_id,proposal_id,contact_id) VALUES($1,$2,$3,$4)`,[order,org,proposal,contact]);
 await db.query(`INSERT INTO public.proposal_line_items VALUES($1,$2,$3,$4,'Manual-approved receiver','material',1,500,500,125,false,222)`,[line,org,proposal,product]);
 await db.exec('COMMIT');
 const stored=(await db.query('SELECT * FROM techsafe_source.native_approval_equipment_basis')).rows;
 assert.equal(stored.length,1);assert.equal(stored[0].basis.lines.length,1);
 assert.equal(stored[0].basis.lines[0].labor_total,125);
 assert.equal(JSON.stringify(stored[0].basis).includes('internal_cost'),false);
 const verify=createNativeApprovalBasisVerifier({query:(q,p)=>db.query(q,p)});
 assert.equal((await verify(scope)).reason,'serializable_transaction_required');
 await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
 const good=await verify(scope);assert.equal(good.ok,true);assert.equal(good.originalScopeVerified,true);assert.equal(good.authorized,false);
 assert.equal((await verify({...scope,organizationId:otherOrg})).reason,'native_approval_basis_missing');
 await db.exec('COMMIT');
 // Post-approval financial/scope edits cannot be silently recertified.
 for(const edit of ["unit_price=501","labor_total=126","description='Other product'","quantity=2","is_customer_supplied=true"]){
  await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await db.query(`UPDATE public.proposal_line_items SET ${edit} WHERE id=$1`,[line]);
  assert.equal((await verify(scope)).reason,'current_rows_differ_from_native_approval',edit);
  await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
 await db.query('DELETE FROM public.proposal_line_items WHERE id=$1',[line]);
 assert.equal((await verify(scope)).reason,'current_rows_differ_from_native_approval');
 await db.exec('ROLLBACK');
 // Pending CO source is not applied scope. Approved CO requires a new trusted
 // commitment, never replay over current rows or reuse the original snapshot.
 await db.query(`INSERT INTO public.change_orders VALUES($1,$2,$3,'draft')`,[co,org,order]);
 await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');assert.equal((await verify(scope)).ok,true);await db.exec('COMMIT');
 await db.query(`UPDATE public.change_orders SET status='approved' WHERE id=$1`,[co]);
 await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');assert.equal((await verify(scope)).reason,'committed_change_basis_required');await db.exec('COMMIT');
 await assert.rejects(db.query(`UPDATE techsafe_source.native_approval_equipment_basis SET basis='{}'`),/immutable/);
 await assert.rejects(db.query(`DELETE FROM techsafe_source.native_approval_equipment_basis`),/immutable/);
 await db.exec('SET ROLE authenticated');
 await assert.rejects(db.query('SELECT * FROM techsafe_source.native_approval_equipment_basis'),/permission denied/);
 await db.exec('RESET ROLE');
 // An aborted native approval leaves no approval basis.
 const [p2,o2]=ids.slice(12);
 await db.exec('BEGIN');
 await db.query(`INSERT INTO public.proposals VALUES($1,$2,null,$3,'draft',null,null)`,[p2,org,contact]);
 await db.query(`INSERT INTO public.sales_orders(id,organization_id,proposal_id,contact_id) VALUES($1,$2,$3,$4)`,[o2,org,p2,contact]);
 await db.query(`UPDATE public.proposals SET status='approved',approved_at=now(),sales_order_id=$2 WHERE id=$1`,[p2,o2]);
 await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
 await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_approval_equipment_basis')).rows[0].n,1);
 // Exercise the REAL owned certification and delivery gate, not mocked proof.
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261108150000_techsafe_private_order_revision_ledger.sql',import.meta.url),'utf8'));
 await db.exec(`ALTER TABLE public.proposals ADD COLUMN accepted_via_method text,ADD COLUMN approved_by uuid;

 ALTER TABLE public.proposal_line_items ADD COLUMN is_hidden boolean DEFAULT false,
 ADD COLUMN committed_change_order_line_id uuid,ADD COLUMN parent_item_id uuid,ADD COLUMN display_mode text;
 ALTER TABLE public.change_orders ADD COLUMN is_active boolean DEFAULT true,
 ADD COLUMN is_locked boolean DEFAULT false,ADD COLUMN approval_date timestamptz,
 ADD COLUMN requires_customer_approval boolean DEFAULT false,ADD COLUMN customer_approved boolean DEFAULT false,
 ADD COLUMN updated_at timestamptz DEFAULT now();
 CREATE TABLE public.change_order_line_items(id uuid PRIMARY KEY,organization_id uuid,change_order_id uuid,proposal_line_item_id uuid,action_type text);
 CREATE TABLE public.contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,contact_name text);
 CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid,name text,manufacturer text,model_number text,sku text,item_type text);`);
 await db.query(`UPDATE public.change_orders SET status='draft' WHERE id=$1`,[co]);
 await db.query(`INSERT INTO public.contacts VALUES($1,$2,'Integration Test',null)`,[contact,org]);
 await db.query(`INSERT INTO public.products VALUES($1,$2,'Receiver','Test','RX1','RX1','material')`,[product,org]);
 const connection=ids[11],binding={connectionId:connection,organizationId:org,orderId:order,proposalId:proposal};
 await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,organization_id,sales_order_id,proposal_id,connection_generation,status,enabled)
 VALUES($1,$2,$3,$4,1,'active',true)`,[connection,org,order,proposal]);
 const {createNativeOrderAuthority}=await import('../../src/lib/techsafe/postgresNativeOrderAuthority.mjs');
 const {createLiveSalesOrderPreflight}=await import('../../supabase/functions/_shared/techsafe-live-sales-order-preflight.mjs');
 const {fingerprintCurrentSalesOrder}=await import('../../supabase/functions/_shared/techsafe-current-order-fingerprint.mjs');
 const {createHash}=await import('node:crypto');
 const digest=s=>createHash('sha256').update(s).digest('hex');
 const client={query:async(q,p)=>{try{return await db.query(q,p);}catch(error){console.error('Fixture SQL error:',error.message);throw error;}},release:()=>{}};
 const gate=createNativeOrderAuthority({connect:async()=>client},{sourceInstanceId:'mjv_test',environment:'sandbox',minimumUnitValueCents:25000});
 const observed=await createLiveSalesOrderPreflight(client)({connectionId:connection,orderId:order});
 const fp=await fingerprintCurrentSalesOrder(observed.source,digest);
 assert.equal(fp.valid,true);
 const request={binding,generation:1,fingerprint:fp.fingerprint};
 const certified=await gate.certifySource(request);
 assert.equal(certified.verified,true,certified.reason);
 assert.equal(certified.revision,1);
 assert.equal(certified.snapshot.soldLaborCents,12500);
 assert.equal(certified.snapshot.lines[0].description,'Manual-approved receiver');
 const retry=await gate.certifySource(request);
 assert.equal(retry.eventId,certified.eventId);assert.equal(retry.revision,1);
 const delivery={binding,generation:1,revision:certified.revision,eventId:certified.eventId,snapshot:certified.snapshot};
 assert.equal((await gate.authorizeForDelivery(delivery)).authorized,true);
 assert.equal((await gate.authorizeForDelivery({...delivery,snapshot:{...delivery.snapshot,soldLaborCents:0}})).authorized,false);
 assert.equal((await gate.authorizeForDelivery({...delivery,eventId:ids[14]})).authorized,false);
 // The real sender now uses actual persisted native DB authority callbacks.
 const {createTechsafeSalesOrderSender}=await import('../../supabase/functions/_shared/techsafe-sales-order-sender.mjs');
 let sends=0;
 const sender=createTechsafeSalesOrderSender({client,digest,...gate,fetchImpl:async(url,options)=>{
  sends++;const body=JSON.parse(options.body);
  assert.equal(body.customerName,'Integration Test');assert.equal(body.soldLaborCents,12500);
  assert.equal(body.lines[0].unitEquipmentValueCents,50000);
  assert.equal(JSON.stringify(body).includes('internal_cost'),false);
  return {status:200,json:async()=>({accepted:true,connectionId:connection,orderId:order,
   sourceRevision:String(body.revision),generation:body.generation,eventId:body.eventId})};
 }});
 assert.equal((await sender({connectionId:connection,orderId:order,enabled:true,
  endpoint:'https://techsafe.example/import',allowedOrigin:'https://techsafe.example',token:'x'.repeat(48)})).accepted,true);
 assert.equal(sends,1);
 const {createNativeTechsafeOrderSender}=await import('../../supabase/functions/_shared/techsafe-native-order-sender.mjs');
 let leased=false;
 const privatePool={connect:async()=>{assert.equal(leased,false,'single-connection pool must be released before nested work');leased=true;return {query:client.query,release:()=>{leased=false;}};}};
 const privateOptions={pool:privatePool,sourceInstanceId:'mjv_test',environment:'sandbox',minimumUnitValueCents:25000,
  readSecret:async scope=>({...scope,endpoint:'https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import',token:'a'.repeat(48)}),
  fetchImpl:async(url,options)=>{
   sends++;assert.equal(url,'https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import');
   assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(48));
   const body=JSON.parse(options.body);
   return {status:200,json:async()=>({accepted:true,connectionId:connection,orderId:order,
    sourceRevision:String(body.revision),generation:1,eventId:body.eventId})};
  }};
 assert.equal((await createNativeTechsafeOrderSender(privateOptions)({connectionId:connection,orderId:order})).reason,'integration_disabled');
 const composed=createNativeTechsafeOrderSender({...privateOptions,enabled:true});
 assert.equal((await composed({connectionId:connection,orderId:order})).accepted,true);
 assert.equal(sends,2);
 assert.equal((await createNativeTechsafeOrderSender({...privateOptions,enabled:true,readSecret:async()=>null})({connectionId:connection,orderId:order})).reason,'credentials_unavailable');
 assert.equal(sends,2);
 // A failure after revision/certificate writes must roll back both.
 await db.query(`UPDATE public.contacts SET full_name='Changed Test Name' WHERE id=$1`,[contact]);
 const brokenClient={query:(q,p)=>q.startsWith('UPDATE techsafe_source.equipment_snapshot_certificates SET export_snapshot')?
  Promise.reject(new Error('simulated export persistence failure')):client.query(q,p),release:()=>{}};
 const broken=createNativeOrderAuthority({connect:async()=>brokenClient},{sourceInstanceId:'mjv_test',environment:'sandbox',minimumUnitValueCents:25000});
 assert.equal((await broken.certifySource(request)).verified,false);
 assert.equal(Number((await db.query('SELECT revision FROM techsafe_source.order_revision_ledger')).rows[0].revision),1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.equipment_snapshot_certificates')).rows[0].n,1);
 await db.query(`UPDATE public.contacts SET full_name='Integration Test' WHERE id=$1`,[contact]);
 await db.query('UPDATE public.proposal_line_items SET labor_total=999 WHERE id=$1',[line]);
 assert.equal((await gate.authorizeForDelivery(delivery)).authorized,false);
 assert.equal((await gate.certifySource(request)).reason,'current_rows_differ_from_native_approval');
 // No partial certificate/revision is committed after failed source checks.
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.equipment_snapshot_certificates')).rows[0].n,1);
 await db.query('UPDATE public.proposal_line_items SET labor_total=125 WHERE id=$1',[line]);
 await db.query(`UPDATE techsafe_source.integration_connections SET enabled=false,status='held' WHERE connection_id=$1`,[connection]);
 assert.equal((await gate.authorizeForDelivery(delivery)).authorized,false);
 console.log('PASS: real PostgreSQL native approval -> certificate/export persistence -> composed private sender; stable retry, changed scope, forged delivery, held connection, secret isolation and rollback');
}finally{await db.close();}
