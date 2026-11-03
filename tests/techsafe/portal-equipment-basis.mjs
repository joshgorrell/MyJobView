import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessApprovedRowsConnection} from '../../supabase/functions/_shared/techsafe-approved-rows-connection.mjs';
const migration='supabase/migrations/20261031193323_techsafe_portal_approval_equipment_basis.sql';
export async function testPortalEquipmentBasis(f){
 const {db,id,org,other,actor,outsider,order,proposal,connection,line}=f,request=id(70),customer=id(7),stamp='2026-10-31T12:00:00Z';
 await db.exec(`CREATE SCHEMA private;
 CREATE TABLE private.proposal_customer_decisions(proposal_id uuid NOT NULL,request_id uuid NOT NULL,viewer_id uuid NOT NULL,portal_version integer NOT NULL,
  action text NOT NULL,details jsonb NOT NULL,result jsonb NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(proposal_id,request_id));
 ALTER TABLE private.proposal_customer_decisions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE proposals ADD COLUMN status text,ADD COLUMN contact_id uuid,ADD COLUMN sales_order_id uuid,ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,ADD COLUMN approval_completed_at timestamptz,ADD COLUMN current_portal_version integer,ADD COLUMN accepted_via_method text;
 ALTER TABLE sales_orders ADD COLUMN created_at timestamptz;`);
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 await db.query("UPDATE proposals SET status='approved',contact_id=$1,sales_order_id=$2,approved_by=$3,approved_at=$4,approval_completed_at=$4,current_portal_version=1,accepted_via_method='payment' WHERE id=$5",[customer,order,actor,stamp,proposal]);
 await db.query('UPDATE sales_orders SET created_at=$1 WHERE id=$2',[stamp,order]);
 await db.exec(fs.readFileSync(migration,'utf8'));
 const read=async(c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_portal_approval_equipment_basis($1,$2) AS basis',[c,o])).rows[0].basis;
 assert.equal(await read(),null,'Approval headers alone, including staff approval, are not a portal receipt');
 await db.query(`INSERT INTO private.proposal_customer_decisions
  SELECT $1,$2,$3,1,'approve',jsonb_build_object('method','payment','private_note','PRIVATE_DETAILS'),
   jsonb_build_object('status','approved','sales_order_id',$4::uuid),
   jsonb_build_object('proposal',jsonb_build_object('id',$1::uuid,'organization_id',$5::uuid,'contact_id',$6::uuid,'sales_order_id',NULL,
    'status','sent','is_active_revision',true,'current_portal_version',1,'email','PRIVATE_EMAIL'),
    'items',(SELECT jsonb_agg(to_jsonb(li)||jsonb_build_object('quantity',CASE WHEN li.id=$7 THEN 2.00::numeric(10,2) ELSE li.quantity END,
     'room_id',NULL,'cost',99999,'private_notes','PRIVATE_ITEM') ORDER BY li.id) FROM proposal_line_items li WHERE proposal_id=$1),
    'rooms','[]'::jsonb,'settings','[]'::jsonb,'display',jsonb_build_object('private','PRIVATE_DISPLAY')),$8::timestamptz`,
  [proposal,request,actor,order,org,customer,line,stamp]);
 const original=await read();assert.ok(original);assert.equal(original.sourceKind,'customer_portal_approval');assert.equal(original.lines.length,2);
 assert.equal(original.lines.find(x=>x.line.id===line).line.quantity,'2.00');assert.equal(original.lines.find(x=>x.line.id===line).unitSalePrice,'800.00');
 assert.equal(original.originalScopeVerified,false);assert.equal(original.scopeVerified,false);assert.equal(original.snapshotReady,false);assert.equal(original.quoteReady,false);
 // Read both private inputs in one statement snapshot for the direct path.
 await db.exec('BEGIN;DELETE FROM techsafe_source.application_observations;DELETE FROM change_order_line_items;DELETE FROM change_orders;');
 await db.query('UPDATE proposal_line_items SET quantity=2 WHERE id=$1',[line]);
 const connected=async()=>{
  const {model,basis}=(await db.query('SELECT techsafe_source.read_order_equipment_source($1,$2) AS model,techsafe_source.read_portal_approval_equipment_basis($1,$2) AS basis',[connection,order])).rows[0];
  return assessApprovedRowsConnection({currentModel:model,basis,pairs:[]},{connectionId:connection,organizationId:org,orderId:order,proposalId:proposal});
 };
 const direct=await connected();assert.equal(direct.approvedRowsConnected,true,JSON.stringify(direct));assert.equal(direct.connectionMode,'direct');assert.equal(direct.scopeVerified,false);assert.equal(direct.quoteReady,false);
 await db.query('UPDATE proposal_line_items SET quantity=3 WHERE id=$1',[line]);assert.equal((await connected()).approvedRowsConnected,false);
 await db.exec('ROLLBACK');
 assert.equal(JSON.stringify(original).includes('PRIVATE_'),false);
 for(const key of ['cost','retail_price','email','phone','private_notes','settings','display','rooms','viewer_id'])assert.equal(JSON.stringify(original).includes('"'+key+'"'),false);
 // Unassigned-room items are present; subsequent source edits cannot rewrite an approval record.
 await db.exec('BEGIN');await db.query('UPDATE proposal_line_items SET quantity=99,cost=123,unit_price=900 WHERE id=$1',[line]);assert.deepEqual(await read(),original);await db.exec('ROLLBACK');
 await db.exec("SET TIME ZONE 'America/Chicago'");assert.deepEqual(await read(),original);await db.exec("SET TIME ZONE 'UTC'");
 for(const update of ["status='draft'","approved_by='"+outsider+"'","approved_at=approved_at+interval '1 second'",
  "approval_completed_at=approval_completed_at+interval '1 second'","current_portal_version=2","accepted_via_method='verbal'","sales_order_id=NULL"]){
  await db.exec('BEGIN');await db.exec('UPDATE proposals SET '+update);assert.equal(await read(),null,update);await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN');await db.exec("UPDATE sales_orders SET created_at=created_at-interval '1 second'");assert.equal(await read(),null);await db.exec('ROLLBACK');
 for(const [column,path,value] of [
  ['evidence','{proposal,organization_id}',JSON.stringify(other)],['evidence','{proposal,contact_id}',JSON.stringify(id(999))],
  ['evidence','{proposal,sales_order_id}',JSON.stringify(order)],['evidence','{proposal,status}','"approved"'],
  ['evidence','{proposal,is_active_revision}','false'],['evidence','{proposal,current_portal_version}','2'],
  ['evidence','{items}','{}'],['evidence','{items,0,organization_id}',JSON.stringify(other)],
  ['evidence','{items,0,proposal_id}',JSON.stringify(id(999))],['evidence','{items,0,product_id}','"not-uuid"'],
  ['evidence','{items,0,quantity}','"2.00"'],['evidence','{items,0,is_customer_supplied}','null'],
  ['evidence','{items,0,item_type}','"unknown"'],['result','{sales_order_id}',JSON.stringify(id(999))],['details','{method}','"verbal"']
 ]){
  await db.exec('BEGIN');await db.query('UPDATE private.proposal_customer_decisions SET '+column+'=jsonb_set('+column+',$1,$2::jsonb)',[path,value]);
  assert.equal(await read(),null,column+' '+path);await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN');await db.exec("UPDATE private.proposal_customer_decisions SET evidence=evidence #- '{items,0,is_hidden}'");assert.equal(await read(),null);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.exec("UPDATE private.proposal_customer_decisions SET evidence=jsonb_set(evidence,'{items}',(evidence->'items')||jsonb_build_array(evidence->'items'->0))");assert.equal(await read(),null);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query('INSERT INTO private.proposal_customer_decisions SELECT proposal_id,$1,viewer_id,portal_version,action,details,result,evidence,created_at FROM private.proposal_customer_decisions',[id(71)]);assert.equal(await read(),null,'Multiple approvals are ambiguous, not first/last wins');await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.exec("UPDATE private.proposal_customer_decisions SET evidence=evidence||jsonb_build_object('large',repeat('X',4194304))");assert.equal(await read(),null);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query(`UPDATE private.proposal_customer_decisions SET evidence=jsonb_set(evidence,'{items}',
  (SELECT jsonb_agg(jsonb_build_object('id',('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::text,
   'organization_id',$1::text,'proposal_id',$2::text,'product_id',NULL,'item_type','material','quantity',1,'unit_price',1,
   'is_customer_supplied',false,'is_hidden',false,'description','X')) FROM generate_series(1,10001) n))`,[org,proposal]);
 assert.ok((await db.query('SELECT octet_length(evidence::text) AS size FROM private.proposal_customer_decisions')).rows[0].size<4194304);
 assert.equal(await read(),null,'Item count overflow must be rejected even within the raw-byte cap');await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.exec(`UPDATE private.proposal_customer_decisions SET evidence=jsonb_set(evidence,'{items}',
  (SELECT jsonb_agg(jsonb_set(jsonb_set(evidence->'items'->0,'{id}',to_jsonb(('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::text)),'{description}',to_jsonb(repeat('X',12000)))) FROM generate_series(1,100) n))`);
 assert.equal(await read(),null,'Oversized projected rows must not be truncated');await db.exec('ROLLBACK');
 await db.exec('BEGIN');await db.query("INSERT INTO private.proposal_customer_decisions SELECT proposal_id,('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,viewer_id,portal_version,'decline','{}','{}','{}',created_at FROM private.proposal_customer_decisions CROSS JOIN generate_series(1,1000) n");assert.equal(await read(),null);await db.exec('ROLLBACK');
 for(const update of ["enabled=false","status='paused'","status='revoked'","last_verified_at=now()-interval '6 minutes'"]){await db.exec('BEGIN');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK');}
 assert.equal(await read(id(999)),null);assert.equal(await read(connection,id(999)),null);
 await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal(await read(),null);await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 for(const role of ['anon','authenticated','service_role']){await db.exec('BEGIN;SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK');}
 const attrs=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_portal_approval_equipment_basis(uuid,uuid)'::regprocedure")).rows[0];
 assert.equal(attrs.prosecdef,false);assert.equal(attrs.provolatile,'s');assert.deepEqual(attrs.proconfig,['search_path=""']);
 const snapshot=JSON.stringify((await db.query('SELECT to_jsonb(d) AS value FROM private.proposal_customer_decisions d')).rows);await read();assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(d) AS value FROM private.proposal_customer_decisions d')).rows),snapshot);
 console.log('Portal approval equipment basis passed: original bound receipt rows including unassigned rooms, unchanged historical values, strict approval/version/actor/order bindings, ambiguity/malformed/tenant/health/API denial, no private/cost output or writes, and bounded whole candidates. Original membership and quote flags remain false.');
}
