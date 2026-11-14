import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createNativeApprovalBasisVerifier} from '../../src/lib/techsafe/postgresNativeApprovalBasis.mjs';
const serverUrl=process.env.TECHSAFE_NATIVE_COMMIT_TEST_DATABASE_URL;
let server;
if(serverUrl){const {Client}=await import('pg');server=new Client({connectionString:serverUrl});await server.connect();}
const db=server?{query:(s,p)=>server.query(s,p),exec:s=>server.query(s),close:()=>server.end()}:new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [org,user,proposal,order,contact,base,otherOrg]=[1,2,3,4,5,6,7].map(id);
const migration='20261114192257_techsafe_native_committed_order_basis.sql';
const sql=async file=>db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
const verify=async(scope={orderId:order,organizationId:org,proposalId:proposal})=>{
 await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{return await createNativeApprovalBasisVerifier({query:async(s,p)=>{try{return await db.query(s,p);}catch(e){console.error('Verifier SQL:',e.message,e.where??'');throw e;}}})(scope);}finally{await db.exec('ROLLBACK');}
};
const count=async table=>Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
const addCO=async(n,action='add',target=null,sourceOrder=order)=>{
 const co=id(n),line=id(n+100);
 await db.query(`INSERT INTO public.change_orders(id,organization_id,sales_order_id,status,change_amount,parts_subtotal)
  VALUES($1,$2,$3,'draft',500,500)`,[co,org,sourceOrder]);
 await db.query(`INSERT INTO public.change_order_line_items(id,organization_id,change_order_id,action_type,proposal_line_item_id,
  product_name,product_description,new_quantity,new_unit_price,new_total,change_amount,item_type)
  VALUES($1,$2,$3,$4,$5,'Added receiver','Added receiver',1,500,500,500,'material')`,[line,org,co,action,target]);
 return {co,line};
};
const approve=co=>db.query('SELECT public.approve_and_apply_change_order($1)',[co]);
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE SCHEMA auth;CREATE SCHEMA techsafe_source;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  CREATE TABLE public.organizations(id uuid PRIMARY KEY);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY,organization_id uuid,role text);
  CREATE TABLE public.proposals(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,status text,
   sales_order_id uuid,approved_at timestamptz,approval_completed_at timestamptz);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid REFERENCES public.proposals(id),
   contact_id uuid,status text DEFAULT 'planning',created_at timestamptz DEFAULT now());
  CREATE TABLE public.proposal_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid REFERENCES public.proposals(id),
   organization_id uuid,product_id uuid,description text,item_type text,quantity numeric,unit_price numeric,line_total numeric,
   labor_total numeric DEFAULT 0,labor_hours numeric,labor_rate numeric,is_customer_supplied boolean DEFAULT false,
   is_hidden boolean DEFAULT false,is_taxable boolean,labor_phase_id uuid,sort_order integer DEFAULT 0,
   committed_change_order_line_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
  CREATE TABLE public.change_orders(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid REFERENCES public.sales_orders(id),
   status text,is_locked boolean DEFAULT false,is_active boolean DEFAULT true,approval_date timestamptz,
   requires_customer_approval boolean DEFAULT false,customer_approved boolean DEFAULT false,
   approved_by uuid,approved_by_name text,approval_notes text,is_billable boolean DEFAULT true,show_on_report boolean,
   change_amount numeric DEFAULT 0,parts_subtotal numeric DEFAULT 0,tax_amount numeric DEFAULT 0,
   new_contract_total numeric DEFAULT 0,labor_subtotal numeric DEFAULT 0,project_id uuid,updated_at timestamptz DEFAULT now());
  CREATE TABLE public.change_order_line_items(id uuid PRIMARY KEY,organization_id uuid,change_order_id uuid REFERENCES public.change_orders(id),
   proposal_line_item_id uuid,action_type text,product_id uuid,product_name text,product_description text,
   new_quantity numeric,new_unit_price numeric,new_total numeric,change_amount numeric,is_taxable boolean DEFAULT true,
   item_type text,labor_phase_id uuid,sort_order integer DEFAULT 0,created_at timestamptz DEFAULT now(),
   labor_hours numeric,labor_rate numeric,new_labor_total numeric DEFAULT 0,labor_total numeric DEFAULT 0);
  CREATE TABLE public.invoices(id uuid PRIMARY KEY,sales_order_id uuid,proposal_id uuid,project_id uuid);
  CREATE TABLE public.invoice_change_order_links(change_order_id uuid);
  CREATE TABLE public.invoice_line_item_sources(source_id uuid,source_type text);`);
 await db.query('INSERT INTO public.organizations VALUES($1),($2)',[org,otherOrg]);
 await db.query("INSERT INTO public.profiles VALUES($1,$2,'admin')",[user,org]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
 for(const file of ['20261109183000_techsafe_equipment_certificate_storage.sql','20261113152226_techsafe_native_approval_basis.sql',
  '20261111160000_change_order_committed_revision_foundation.sql','20261111190000_change_order_commit_revision_integrity.sql',
  '20261112050000_prevent_committed_change_order_reapply.sql',
  '20261108150000_techsafe_private_order_revision_ledger.sql','20261114115511_techsafe_sales_order_completion_clock.sql'])await sql(file);
 await db.exec(`CREATE TABLE change_order_commit.revision_drafts(change_order_id uuid PRIMARY KEY REFERENCES public.change_orders(id),
  organization_id uuid,base_revision_number bigint,draft_lines jsonb,edit_version bigint,created_by uuid,updated_by uuid);
  `);
 await sql('20261112100000_private_transaction_revision_authorization.sql');
 await db.exec(`CREATE TRIGGER native_locked_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_change_order_line_mutation();`);
 await sql('20261112074500_fix_revision_decimal_validation.sql');
 await sql('20261112123000_fix_change_order_revision_sha256.sql');
 await db.exec('BEGIN');
 await db.query("INSERT INTO public.proposals VALUES($1,$2,$3,'designing',null,null,null)",[proposal,org,contact]);
 await db.query('INSERT INTO public.sales_orders(id,organization_id,proposal_id,contact_id) VALUES($1,$2,$3,$4)',[order,org,proposal,contact]);
 await db.query(`INSERT INTO public.proposal_line_items(id,proposal_id,organization_id,description,item_type,quantity,unit_price,line_total,labor_total)
  VALUES($1,$2,$3,'Original receiver','material',1,700,700,100)`,[base,proposal,org]);
 await db.query("UPDATE public.proposals SET status='approved',sales_order_id=$2,approved_at=now() WHERE id=$1",[proposal,order]);
 await db.exec('COMMIT');
 // A pre-migration native commit is deliberately not backfilled or blessed by
 // a later native commit, even though its original approval basis is present.
 const historicalProposal=id(50),historicalOrder=id(51);
 await db.exec('BEGIN');
 await db.query("INSERT INTO public.proposals VALUES($1,$2,$3,'designing',null,null,null)",[historicalProposal,org,contact]);
 await db.query('INSERT INTO public.sales_orders(id,organization_id,proposal_id,contact_id) VALUES($1,$2,$3,$4)',[historicalOrder,org,historicalProposal,contact]);
 await db.query("UPDATE public.proposals SET status='approved',sales_order_id=$2,approved_at=now() WHERE id=$1",[historicalProposal,historicalOrder]);
 await db.exec('COMMIT');
 const historical=await addCO(60,'add',null,historicalOrder);await approve(historical.co);
 await sql(migration);
 {const result=await verify();assert.equal(result.ok,true,JSON.stringify(result));}
 const first=await addCO(10);
 assert.equal((await verify()).ok,true,'pending CO has not changed sold scope');
 await approve(first.co);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),1);
 assert.equal(await count('techsafe_source.native_commit_preparations'),0);
 assert.equal((await verify()).reason,'native_committed_basis_matches_current_order');
 assert.equal((await verify({orderId:historicalOrder,organizationId:org,proposalId:historicalProposal})).reason,'committed_change_basis_required');
 const historicalLater=await addCO(70,'add',null,historicalOrder);await approve(historicalLater.co);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.native_committed_order_basis WHERE sales_order_id=$1',[historicalOrder])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.proposal_line_items WHERE proposal_id=$1',[proposal])).rows[0].n,2);
 await assert.rejects(approve(first.co),/Already approved|replay/);
 await assert.rejects(db.query('UPDATE techsafe_source.native_committed_order_basis SET basis=\'{}\''),/immutable/);
 await assert.rejects(db.query('DELETE FROM techsafe_source.native_committed_order_basis'),/immutable/);
 // A legitimate staged material revision is committed by the existing native RPC.
 const committed=(await db.query('SELECT committed_lines FROM change_order_commit.revisions WHERE change_order_id=$1',[first.co])).rows[0].committed_lines;
 const draft=committed.map(x=>({...x,new_quantity:2,new_total:1000,change_amount:1000}));
 await db.query('INSERT INTO change_order_commit.revision_drafts VALUES($1,$2,1,$3::jsonb,1,$4,$4)',[first.co,org,JSON.stringify(draft),user]);
 assert.equal((await verify()).ok,true,'staged edits do not change the approved source');
 await db.query('SELECT public.commit_staged_change_order_material_revision($1,1)',[first.co]);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),2);
 assert.equal((await verify()).ok,true);
 const added=(await db.query('SELECT * FROM public.proposal_line_items WHERE committed_change_order_line_id=$1',[first.line])).rows[0];
 assert.equal(Number(added.quantity),2);assert.equal(Number(added.line_total),1000);
 // Native removal applies once and checkpoints the resulting full order.
 const removal=await addCO(20,'remove',base);await approve(removal.co);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),3);
 assert.equal((await verify()).ok,true);
 assert.equal((await db.query('SELECT is_hidden FROM public.proposal_line_items WHERE id=$1',[base])).rows[0].is_hidden,true);
 // Verify the checkpoint through the actual certificate + export authority.
 await db.exec(`ALTER TABLE public.proposals ADD COLUMN accepted_via_method text DEFAULT 'verbal',ADD COLUMN approved_by uuid;
  ALTER TABLE public.proposal_line_items ADD COLUMN parent_item_id uuid,ADD COLUMN display_mode text;
  CREATE TABLE public.contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,contact_name text);
  CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid,name text,manufacturer text,model_number text,sku text,item_type text);`);
 await db.query("INSERT INTO public.contacts VALUES($1,$2,'Native CO Test',null)",[contact,org]);
 const connection=id(80),binding={connectionId:connection,organizationId:org,proposalId:proposal,orderId:order};
 await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,organization_id,proposal_id,sales_order_id,status,enabled)
  VALUES($1,$2,$3,$4,'active',true)`,[connection,org,proposal,order]);
 const {createNativeOrderAuthority}=await import('../../src/lib/techsafe/postgresNativeOrderAuthority.mjs');
 const {createLiveSalesOrderPreflight}=await import('../../supabase/functions/_shared/techsafe-live-sales-order-preflight.mjs');
 const {fingerprintCurrentSalesOrder}=await import('../../supabase/functions/_shared/techsafe-current-order-fingerprint.mjs');
 const {createHash}=await import('node:crypto');
 const gate=createNativeOrderAuthority({connect:async()=>({query:(s,p)=>db.query(s,p),release:()=>{}})},
  {sourceInstanceId:'mjv_test',environment:'sandbox'});
 // Completed COs still remove their equipment from the current sold scope.
 await db.query("UPDATE public.change_orders SET status='completed' WHERE id=$1",[removal.co]);
 const observed=await createLiveSalesOrderPreflight(db)({connectionId:connection,orderId:order});
 const fp=await fingerprintCurrentSalesOrder(observed.source,s=>createHash('sha256').update(s).digest('hex'));
 const certified=await gate.certifySource({binding,generation:1,fingerprint:fp.fingerprint});
 assert.equal(certified.verified,true,certified.reason);
 assert.equal(certified.snapshot.lines.length,1);assert.equal(certified.snapshot.lines[0].quantity,2);
 assert.equal(certified.snapshot.soldLaborCents,0,'removed original labor is not double counted');
 assert.equal((await gate.authorizeForDelivery({binding,generation:1,revision:certified.revision,eventId:certified.eventId,snapshot:certified.snapshot})).authorized,true);
 // A later native approval that rolls back must roll back both checkpoint and
 // business changes, preserving the last committed whole-order evidence.
 const rollback=await addCO(90,'modify_price',added.id);
 await db.exec('BEGIN');await approve(rollback.co);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),4);
 await db.exec('ROLLBACK');assert.equal(await count('techsafe_source.native_committed_order_basis'),3);
 assert.equal((await verify()).ok,true);
 if(server){
  const {Client}=await import('pg'),concurrent=new Client({connectionString:serverUrl});await concurrent.connect();
  await db.exec('BEGIN');
  try{
   await approve(rollback.co);
   await concurrent.query("SET lock_timeout='300ms'");
   await assert.rejects(concurrent.query(`INSERT INTO public.proposal_line_items(id,proposal_id,organization_id,description,item_type,quantity,unit_price,line_total)
    VALUES($1,$2,$3,'Concurrent unsigned addition','material',1,900,900)`,[id(96),proposal,org]),e=>e.code==='55P03','parent lock must exclude concurrent additions');
   await assert.rejects(concurrent.query('UPDATE public.proposal_line_items SET unit_price=999 WHERE id=$1',[base]),
    e=>e.code==='55P03','all original line locks must exclude unrelated concurrent edits');
  }finally{await db.exec('ROLLBACK');await concurrent.end();}
  assert.equal((await verify()).ok,true);
 }
 // Preparations are owned by their CO and clean up transactionally. Native
 // immutable commits remain independent deletion restrictions.
 const abandoned=id(97);
 await db.query(`INSERT INTO public.change_orders(id,organization_id,sales_order_id,status) VALUES($1,$2,$3,'draft')`,[abandoned,org,order]);
 await db.query("UPDATE public.change_orders SET status='approved',is_locked=true,is_active=false,approval_date=now() WHERE id=$1",[abandoned]);
 assert.equal(await count('techsafe_source.native_commit_preparations'),1);
 await db.exec('BEGIN');await db.query('DELETE FROM public.change_orders WHERE id=$1',[abandoned]);
 assert.equal(await count('techsafe_source.native_commit_preparations'),0);
 await db.exec('ROLLBACK');assert.equal(await count('techsafe_source.native_commit_preparations'),1);
 await db.query('DELETE FROM public.change_orders WHERE id=$1',[abandoned]);
 assert.equal(await count('techsafe_source.native_commit_preparations'),0);
 await assert.rejects(db.query('DELETE FROM public.sales_orders WHERE id=$1',[order]),/foreign key constraint/);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),3);
 await db.exec('BEGIN');await db.query("UPDATE public.change_orders SET status='draft' WHERE id=$1",[first.co]);
 const reversed=await createNativeApprovalBasisVerifier(db)({orderId:order,organizationId:org,proposalId:proposal});
 assert.equal(reversed.ok,false);await db.exec('ROLLBACK');
 // Drift cannot be laundered by a subsequent valid native CO commit.
 await db.query('UPDATE public.proposal_line_items SET unit_price=701 WHERE id=$1',[base]);
 assert.equal((await verify()).reason,'current_rows_differ_from_native_commit');
 const drifted=await addCO(30,'modify_price',base);await approve(drifted.co);
 assert.equal(await count('techsafe_source.native_committed_order_basis'),3,'unverified pre-scope cannot create a checkpoint');
 assert.equal((await verify()).ok,false);
 assert.equal((await verify({orderId:order,organizationId:otherOrg,proposalId:proposal})).ok,false);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('SET ROLE '+role);
  await assert.rejects(db.query('SELECT * FROM techsafe_source.native_committed_order_basis'),/permission denied/);
  await db.exec('RESET ROLE');
 }
 console.log('PASS: actual native initial approval, staged material commit, removal, replay denial, immutable checkpoints, drift refusal and tenant isolation');
}catch(error){console.error(error.message,error.where??'',error.stack?.split('\n').slice(-3).join('\n'));process.exitCode=1;}finally{await db.close();}
