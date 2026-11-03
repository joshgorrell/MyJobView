import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {prepareOrderContent} from '../../supabase/functions/_shared/techsafe-order-content.mjs';
import {capturedSourceDb} from './fixtures/captured-source-db.mjs';
import {assessApplicationEvidence} from '../../supabase/functions/_shared/techsafe-application-evidence.mjs';
const migration='supabase/migrations/20261031150238_techsafe_private_order_read_model.sql';
const id=n=>'40000000-0000-0000-0000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),actor=id(3),outsider=id(4),order=id(5),proposal=id(6),customer=id(7),connection=id(8),product=id(9),line=id(10),co=id(11);
const db=new PGlite();
try{
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean,role text,can_edit_products boolean);
CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,email text,phone text);
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,discount_percent numeric,discount_amount numeric);
CREATE TABLE proposal_settings(proposal_id uuid PRIMARY KEY,organization_id uuid,discount_percent numeric);
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid,proposal_id uuid,contact_id uuid,status text);
CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid,name text,sku text,item_type text,cost numeric,retail_price numeric,private_notes text);
CREATE TABLE proposal_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,proposal_id uuid,product_id uuid,item_type text,quantity numeric(10,2),unit_price numeric(10,2),is_customer_supplied boolean,description text,is_hidden boolean,cost numeric,internal_notes text);
CREATE TABLE change_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,sales_order_id uuid,proposal_id uuid,status text,is_active boolean,discount_percent numeric,is_billable boolean,change_amount numeric,tax_amount numeric);
CREATE TABLE change_order_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,change_order_id uuid,action_type text,proposal_line_item_id uuid,product_id uuid,product_name text,product_description text,item_type text,new_quantity numeric,new_unit_price numeric,remove_scope text);`);
await db.query('INSERT INTO profiles VALUES($1,$2,true,\'admin\',true),($3,$4,true,\'admin\',true)',[actor,org,outsider,other]);
await db.query("INSERT INTO contacts VALUES($1,$2,'José & Company','PRIVATE_EMAIL','PRIVATE_PHONE')",[customer,org]);
await db.query('INSERT INTO proposals VALUES($1,$2,0,0);',[proposal,org]);await db.query('INSERT INTO proposal_settings VALUES($1,$2,0)',[proposal,org]);
await db.query("INSERT INTO sales_orders VALUES($1,$2,$3,$4,'active')",[order,org,proposal,customer]);
await db.query("INSERT INTO products VALUES($1,$2,'TV','TV-1','material',1,99999,'PRIVATE_CATALOG_NOTE'),($3,$2,'Miscellaneous Item','MISC-ITEM','material',9999,5000,'PRIVATE_MISC_NOTE'),($4,$5,'Other tenant','OTHER','material',1,500,'OTHER_TENANT')",[product,org,id(12),id(13),other]);
await db.query("INSERT INTO proposal_line_items VALUES($1,$2,$3,$4,'material',2,800,false,'Sold equipment',true,1,'PRIVATE_LINE_NOTE'),($5,$2,$3,$6,'material',1,5000,false,'Expensive misc',false,5000,'PRIVATE_MISC_LINE')",[line,org,proposal,product,id(14),id(12)]);
await db.query("INSERT INTO change_orders VALUES($1,$2,$3,$4,'approved',false,0,true,0,0)",[co,org,order,proposal]);
await db.query("INSERT INTO change_order_line_items(organization_id,change_order_id,action_type,product_id,product_name,product_description,item_type,new_quantity,new_unit_price,remove_scope) VALUES($1,$2,'add',$3,'TV','Sold equipment','material',2,800,'parts_and_labor')",[org,co,product]);
await db.exec(fs.readFileSync('supabase/migrations/20261030162612_techsafe_product_exclusions.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261030182910_techsafe_private_application_observations.sql','utf8'));
await db.exec(fs.readFileSync(migration,'utf8'));
await db.query("INSERT INTO techsafe_source.integration_connections(organization_id,connection_id,enabled,status,last_verified_at,minimum_unit_value_cents) VALUES($1,$2,true,'active',now(),50000)",[org,connection]);
const read=async(c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_order_source($1,$2) AS model',[c,o])).rows[0].model;
const original=await read();assert.ok(original);assert.equal(original.customer.full_name,'José & Company');assert.equal(original.lines.length,2);assert.equal(original.minimumUnitValueCents,50000);
const sold=original.lines.find(x=>x.line.id===line);assert.equal(sold.unitSalePrice,'800.00');assert.equal(sold.line.quantity,'2.00');assert.equal(sold.line.is_hidden,true);
assert.equal(sold.membership.verified,false);assert.equal(sold.salesPriceResolved,false);assert.equal(original.changeOrders[0].status,'approved');
assert.equal(original.snapshotReady,false);assert.equal(original.quoteReady,false);assert.equal(prepareOrderContent(original).content,null);
assert.equal(JSON.stringify(original).includes('PRIVATE_'),false);assert.equal(JSON.stringify(original).includes('OTHER_TENANT'),false);
assert.equal(Object.hasOwn(sold.product,'cost'),false);assert.equal(Object.hasOwn(sold.product,'retail_price'),false);
assert.equal(await read(id(999)),null);assert.equal(await read(connection,id(999)),null);
const before=JSON.stringify((await db.query('SELECT to_jsonb(p) AS row FROM products p ORDER BY id')).rows);await read();assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(p) AS row FROM products p ORDER BY id')).rows),before);
// Cost, catalog retail, private contact data and health keepalives are not content.
await db.query('UPDATE products SET cost=999,retail_price=12345 WHERE id=$1',[product]);
await db.query("UPDATE contacts SET email='CHANGED_PRIVATE_EMAIL',phone='CHANGED_PRIVATE_PHONE' WHERE id=$1",[customer]);
await db.exec('UPDATE techsafe_source.integration_connections SET last_verified_at=now()');assert.equal((await read()).sourceFingerprint,original.sourceFingerprint);
for(const statement of ["UPDATE contacts SET full_name='Renamed' WHERE id=$1","UPDATE proposal_line_items SET unit_price=825 WHERE id=$1","UPDATE techsafe_source.integration_connections SET minimum_unit_value_cents=60000 WHERE connection_id=$1"]){
 await db.exec('BEGIN');await db.query(statement,[statement.includes('contacts')?customer:statement.includes('proposal_line_items')?line:connection]);assert.notEqual((await read()).sourceFingerprint,original.sourceFingerprint);await db.exec('ROLLBACK');
}
await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET quantity=3 WHERE id=$1',[line]);assert.notEqual((await read()).sourceFingerprint,original.sourceFingerprint);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('INSERT INTO techsafe_source.product_exclusions(product_id,organization_id,excluded,miscellaneous_placeholder) VALUES($1,$2,true,false)',[product,org]);const opted=await read();assert.equal(opted.lines.find(x=>x.line.id===line).exclusion.excluded,true);assert.notEqual(opted.sourceFingerprint,original.sourceFingerprint);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query("UPDATE change_order_line_items SET new_unit_price=900 WHERE change_order_id=$1",[co]);assert.notEqual((await read()).sourceFingerprint,original.sourceFingerprint);await db.exec('ROLLBACK');
for(const update of ["enabled=false","status='paused'","status='revoked'","last_verified_at=NULL","last_verified_at=now()-interval '6 minutes'","last_verified_at=now()+interval '1 minute'"]){
 await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');
}
for(const update of ["organization_id='"+other+"'","organization_id=NULL"]){await db.exec('BEGIN');await db.exec('UPDATE change_orders SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');}
await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET product_id=$1 WHERE id=$2',[id(13),line]);assert.equal(await read(),null);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('INSERT INTO techsafe_source.product_exclusions(product_id,organization_id,excluded,miscellaneous_placeholder) VALUES($1,$2,false,false)',[product,other]);assert.equal(await read(),null);await db.exec('ROLLBACK');
await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal(await read(),null);
await db.query("SELECT set_config('test.actor',$1,false)",[actor]);assert.ok(await read());await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[actor]);assert.equal(await read(),null);await db.query('UPDATE profiles SET is_active=true WHERE id=$1',[actor]);
await db.query("SELECT set_config('test.actor','',false)");
await db.query("INSERT INTO techsafe_source.application_observations(organization_id,connection_id,sales_order_id,proposal_id,change_order_id,source_hash,before_scope_hash,after_scope_hash,transaction_id,completed_at) VALUES($1,$2,$3,$4,$5,$6,$6,$6,1,now())",[org,connection,order,proposal,co,'a'.repeat(64)]);
const completed=await read();assert.equal(completed.observations[0].completed,true);assert.equal(completed.lines[0].membership.verified,false);assert.equal(completed.quoteReady,false);
await db.exec('BEGIN');await db.query('UPDATE techsafe_source.application_observations SET completed_at=NULL,after_scope_hash=NULL');assert.notEqual((await read()).sourceFingerprint,completed.sourceFingerprint);await db.exec('ROLLBACK');
// Test row and byte bounds without copying any source row.
await db.exec('BEGIN');await db.query("INSERT INTO change_orders(organization_id,sales_order_id,proposal_id,status) SELECT $1,$2,$3,'approved' FROM generate_series(1,999)",[org,order,proposal]);assert.ok(await read());await db.query("INSERT INTO change_orders(organization_id,sales_order_id,proposal_id,status) VALUES($1,$2,$3,'approved')",[org,order,proposal]);assert.equal(await read(),null);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET description=repeat(\'X\',20000) WHERE id=$1',[line]);assert.equal(await read(),null);await db.exec('ROLLBACK');
await db.exec('BEGIN');await db.query("INSERT INTO proposal_line_items(organization_id,proposal_id,product_id,item_type,quantity,unit_price,is_customer_supplied,description,is_hidden) SELECT $1,$2,$3,'material',1,800,false,repeat('X',12000),false FROM generate_series(1,400)",[org,proposal,product]);assert.equal(await read(),null);await db.exec('ROLLBACK');
for(const value of [-1,'9007199254740992'])await assert.rejects(db.query('UPDATE techsafe_source.integration_connections SET minimum_unit_value_cents=$1',[value]),e=>e.code==='23514');
for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN; SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK');}
const attr=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_order_source(uuid,uuid)'::regprocedure")).rows[0];assert.equal(attr.prosecdef,false);assert.equal(attr.provolatile,'s');assert.deepEqual(attr.proconfig,['search_path=""']);
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('sales_orders'::regclass,'proposals'::regclass,'change_orders'::regclass,'proposal_line_items'::regclass)")).rows[0].n,0);
if(process.argv.includes('--equipment-evidence')||process.argv.includes('--equipment-pairs')||process.argv.includes('--portal-basis')||process.argv.includes('--draft-eligibility')||process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs')){
 const update='supabase/migrations/20261031152939_techsafe_equipment_application_evidence.sql';
 await db.exec('ALTER TABLE change_order_line_items ADD COLUMN sort_order integer;ALTER TABLE change_order_line_items ADD COLUMN created_at timestamptz DEFAULT now();');
 const beginDefinition=(await db.query("SELECT pg_get_functiondef('techsafe_source.try_begin_application_observation(uuid)'::regprocedure) AS definition")).rows[0].definition;
 await db.exec('BEGIN');await db.exec(beginDefinition.replace('RETURN identity;','RETURN NULL;'));
 await assert.rejects(db.exec(fs.readFileSync(update,'utf8')),/Review changed observation helper/);await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='techsafe_source.application_observations'::regclass AND attname='equipment_input_hash' AND NOT attisdropped")).rows[0].n,0);
 await db.exec(fs.readFileSync(update,'utf8'));
 const binding={connectionId:connection,organizationId:org,orderId:order,proposalId:proposal};
 const equipment=async()=>(await db.query('SELECT techsafe_source.read_order_equipment_source($1,$2) AS model',[connection,order])).rows[0].model;
 const assess=async()=>assessApplicationEvidence(await equipment(),binding);
 assert.equal((await assess()).applicationEvidenceCurrent,false,'Legacy completed rows must not be backfilled into v2 proof');
 assert.equal((await db.query('SELECT equipment_input_hash FROM techsafe_source.application_observations')).rows[0].equipment_input_hash,null);
 await db.query("UPDATE change_order_line_items SET action_type='modify_quantity',proposal_line_item_id=$1,new_quantity=3 WHERE change_order_id=$2",[line,co]);
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 await db.exec('BEGIN');const observation=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[co])).rows[0].id;assert.ok(observation);
 await db.query('UPDATE proposal_line_items SET quantity=3 WHERE id=$1',[line]);
 assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[co,observation])).rows[0].id,observation);await db.exec('COMMIT');
 assert.equal((await assess()).applicationEvidenceCurrent,true);assert.equal((await assess()).quoteReady,false);assert.equal((await assess()).scopeVerified,false);
 const good=await equipment();
 await db.exec("SET TIME ZONE 'America/Chicago'");assert.deepEqual((await equipment()).equipmentEvidence,good.equipmentEvidence);await db.exec("SET TIME ZONE 'UTC'");
 await db.query('UPDATE products SET cost=4321,retail_price=123 WHERE id=$1',[product]);await db.query('UPDATE proposal_line_items SET cost=888 WHERE id=$1',[line]);
 assert.deepEqual((await equipment()).equipmentEvidence,good.equipmentEvidence);assert.equal((await assess()).applicationEvidenceCurrent,true);
 for(const sql of ['UPDATE proposal_line_items SET unit_price=825 WHERE id=$1','UPDATE change_order_line_items SET new_quantity=4 WHERE change_order_id=$1']){
  await db.exec('BEGIN');await db.query(sql,[sql.includes('proposal_line_items')?line:co]);assert.equal((await assess()).applicationEvidenceCurrent,false);await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN');await db.query('UPDATE change_order_line_items SET sort_order=100 WHERE change_order_id=$1',[co]);assert.equal((await assess()).applicationEvidenceCurrent,false);await db.exec('ROLLBACK');
 await db.query("INSERT INTO change_orders(id,organization_id,sales_order_id,proposal_id,status) VALUES($1,$2,$3,$4,'draft')",[id(50),org,order,proposal]);
 assert.equal((await assess()).applicationEvidenceCurrent,true,'Later drafts must not erase valid per-change equipment evidence');
 await db.query("UPDATE change_orders SET status='approved' WHERE id=$1",[id(50)]);assert.equal((await assess()).applicationEvidenceCurrent,false);
 await db.exec('BEGIN');const second=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[id(50)])).rows[0].id;assert.ok(second);
 assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[id(50),second])).rows[0].id,second);await db.exec('COMMIT');
 assert.equal((await assess()).applicationEvidenceCurrent,true);
 await db.exec('BEGIN');const late=(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[co])).rows[0].id;await db.exec('COMMIT');
 assert.equal((await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[co,late])).rows[0].id,null);assert.equal((await assess()).applicationEvidenceCurrent,false,'A cross-transaction finish must leave incomplete evidence');
 for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN; SET LOCAL ROLE '+role);await assert.rejects(equipment(),e=>e.code==='42501');await db.exec('ROLLBACK');}
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='techsafe_source' AND p.proname IN ('equipment_evidence_content','read_order_equipment_source','try_begin_application_observation','try_finish_application_observation') AND p.prosecdef")).rows[0].n,0);
 console.log('Equipment evidence v2 passed: no legacy backfill, per-change receipts and ordered scope hashes, cost/retail independence, edit and missing-application detection, later draft compatibility, same-transaction completion and API-role denial. Scope and quote certification remain false.');
}
if(process.argv.includes('--equipment-pairs')||process.argv.includes('--candidate-inputs')){
 const {testEquipmentSnapshotPairs}=await import('./equipment-snapshot-pairs.mjs');
 await testEquipmentSnapshotPairs({db,id,org,other,actor,outsider,order,proposal,connection,product,line,co});
}
if(process.argv.includes('--portal-basis')||process.argv.includes('--candidate-inputs')){
 const {testPortalEquipmentBasis}=await import('./portal-equipment-basis.mjs');
 await testPortalEquipmentBasis({db,id,org,other,actor,outsider,order,proposal,connection,line});
}
if(process.argv.includes('--draft-eligibility')||process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs')){
 const {testDraftEligibilitySource}=await import('./draft-eligibility.mjs');
 await testDraftEligibilitySource({db,id,org,other,actor,outsider,order,proposal,connection});
}
if(process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs')){
 const {testUnitSellingPriceSource}=await import('./unit-selling-price.mjs');
 await testUnitSellingPriceSource({db,id,org,actor,order,proposal,connection,line});
}
if(process.argv.includes('--candidate-inputs')){
 const {testCandidateInputs}=await import('./candidate-inputs.mjs');
 await testCandidateInputs({db,id,org,other,actor,outsider,order,proposal,connection,line,product});
}
if(process.argv[2]&&!process.argv[2].startsWith('--')){
 const fixture=await capturedSourceDb(process.argv[2]);try{
  for(const file of ['20261030162612_techsafe_product_exclusions.sql','20261030182910_techsafe_private_application_observations.sql','20261031150238_techsafe_private_order_read_model.sql'])await fixture.db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  if(process.argv.includes('--portal-basis')||process.argv.includes('--draft-eligibility')||process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs'))await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031152939_techsafe_equipment_application_evidence.sql','utf8'));
  if(process.argv.includes('--candidate-inputs'))await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031170609_techsafe_private_equipment_snapshot_pairs.sql','utf8'));
  if(process.argv.includes('--portal-basis')||process.argv.includes('--candidate-inputs')){
   await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031193323_techsafe_portal_approval_equipment_basis.sql','utf8'));
   assert.equal((await fixture.db.query('SELECT techsafe_source.read_portal_approval_equipment_basis($1,$2) AS basis',[connection,order])).rows[0].basis,null);
  }
  if(process.argv.includes('--draft-eligibility')||process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs')){
   await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031202439_techsafe_substantial_completion_draft_gate.sql','utf8'));
   await fixture.db.exec(fs.readFileSync('supabase/migrations/20261101135453_techsafe_precompletion_sales_order_drafts.sql','utf8'));
   assert.equal((await fixture.db.query('SELECT techsafe_source.read_order_draft_candidate($1,$2) AS model',[connection,order])).rows[0].model,null);
  }
  if(process.argv.includes('--unit-selling-prices')||process.argv.includes('--candidate-inputs')){
   await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031203649_techsafe_standalone_selling_price_facts.sql','utf8'));
   assert.equal((await fixture.db.query('SELECT techsafe_source.read_order_selling_price_facts($1,$2) AS model',[connection,order])).rows[0].model,null);
  }
  if(process.argv.includes('--candidate-inputs')){
   await fixture.db.exec(fs.readFileSync('supabase/migrations/20261031213103_techsafe_bounded_candidate_input_bundle.sql','utf8'));
   assert.equal((await fixture.db.query('SELECT techsafe_source.read_draft_candidate_inputs($1,$2) AS bundle',[connection,order])).rows[0].bundle,null);
  }
  assert.equal((await fixture.db.query('SELECT techsafe_source.read_order_source($1,$2) AS model',[connection,order])).rows[0].model,null);
  assert.equal((await fixture.db.query('SELECT count(*)::int AS n FROM techsafe_source.integration_connections')).rows[0].n,0);
  console.log('Private reader compiled against the reconstructed captured schema; missing connections/orders remain unavailable and no connection was seeded. This is not a native Supabase test.');
 }finally{await fixture.db.close();}
}
console.log('Private order read passed: scoped named/priced facts, opt-outs/evidence, stable selective fingerprint, no private/cost/retail leakage or reads with unavailable connections/cross-tenant data, no source writes, API-role denial, bounded rows/bytes and no invented scope/price/quote verification.');
}finally{await db.close();}





