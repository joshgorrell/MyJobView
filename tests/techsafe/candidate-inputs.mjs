import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTechsafeDraftCandidate} from '../../supabase/functions/_shared/techsafe-draft-candidate.mjs';
const migration='supabase/migrations/20261031213103_techsafe_bounded_candidate_input_bundle.sql';
export async function testCandidateInputs(f){
 const {db,id,org,other,actor,outsider,order,proposal,connection,line,product}=f;
 const old=(await db.query("SELECT pg_get_functiondef('techsafe_source.try_begin_application_observation(uuid)'::regprocedure) AS definition")).rows[0].definition;
 await db.exec('BEGIN');await db.exec(old.replace('RETURN identity;','RETURN NULL;'));
 await assert.rejects(db.exec(fs.readFileSync(migration,'utf8')),/Review changed bounded observation helper/);await db.exec('ROLLBACK');
 await db.exec(fs.readFileSync(migration,'utf8'));
 assert.equal((await db.query('SELECT count(equipment_before_fact_bytes)::int AS n FROM techsafe_source.application_observations')).rows[0].n,0,'No legacy byte metadata or evidence backfill');
 await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 const read=async(c=connection,o=order)=>(await db.query('SELECT techsafe_source.read_draft_candidate_inputs($1,$2) AS bundle',[c,o])).rows[0].bundle;
 assert.equal(await read(),null,'Legacy/incomplete history cannot become a partial input bundle');
 await db.exec('BEGIN;DELETE FROM techsafe_source.application_observations;DELETE FROM change_order_line_items;DELETE FROM change_orders;UPDATE proposal_line_items SET is_hidden=false;');
 await db.query('UPDATE proposal_line_items SET quantity=2 WHERE id=$1',[line]);
 await db.exec("UPDATE private.proposal_customer_decisions SET evidence=jsonb_set(evidence,'{items}',(SELECT jsonb_agg(jsonb_set(item,'{is_hidden}','false'::jsonb) ORDER BY item->>'id') FROM jsonb_array_elements(evidence->'items') item))");
 const b={connectionId:connection,organizationId:org,orderId:order,proposalId:proposal};
 const direct=await read();assert.ok(direct);assert.equal(direct.bundleVersion,1);assert.deepEqual(direct.pairs,[]);assert.equal(prepareTechsafeDraftCandidate(direct,b).valid,true);
 assert.equal((await read()).inputFingerprint,direct.inputFingerprint);assert.equal(typeof direct.readAtEpoch,'string');
 assert.equal(JSON.stringify(direct).includes('PRIVATE_'),false);assert.equal(direct.quoteReady,false);
 await db.query("INSERT INTO change_orders(id,organization_id,sales_order_id,proposal_id,status) VALUES($1,$2,$3,$4,'approved')",[id(90),org,order,proposal]);
 await db.query("INSERT INTO change_order_line_items(id,organization_id,change_order_id,action_type,proposal_line_item_id,product_id,product_name,product_description,item_type,new_quantity,new_unit_price,sort_order) VALUES($1,$2,$3,'modify_quantity',$4,$5,'TV','Sold equipment','material',4,800,0)",[id(91),org,id(90),line,product]);
 const begin=async()=>(await db.query('SELECT techsafe_source.try_begin_application_observation($1) AS id',[id(90)])).rows[0].id;
 const finish=async(o)=>(await db.query('SELECT techsafe_source.try_finish_application_observation($1,$2) AS id',[id(90),o])).rows[0].id;
 const observation=await begin();assert.ok(observation);assert.equal(await read(),null,'Incomplete application must not be assembled');
 await db.query('UPDATE proposal_line_items SET quantity=4 WHERE id=$1',[line]);assert.equal(await finish(observation),observation);
 const bundled=await read();assert.ok(bundled);assert.equal(bundled.pairs.length,1);
 const separate=(await db.query('SELECT techsafe_source.read_application_equipment_pair($1,$2,$3) AS pair',[connection,order,observation])).rows[0].pair;
 assert.deepEqual(bundled.pairs[0],separate,'Bundled pair must retain the existing private pair validation/shape');
 const prepared=prepareTechsafeDraftCandidate(bundled,b);assert.equal(prepared.valid,true,JSON.stringify(prepared));assert.equal(prepared.content.lines[0].quantity,4);assert.equal(prepared.content.lines[0].unitEquipmentValueCents,80000);
 const sizes=(await db.query('SELECT equipment_before_fact_bytes=octet_length(equipment_before_facts::text) AS before,equipment_after_fact_bytes=octet_length(equipment_after_facts::text) AS after FROM techsafe_source.application_observations')).rows[0];assert.equal(sizes.before,true);assert.equal(sizes.after,true);
 await db.exec('SAVEPOINT bad_bytes');await assert.rejects(db.query('UPDATE techsafe_source.application_observations SET equipment_before_fact_bytes=2 WHERE id=$1',[observation]),e=>e.code==='23514');await db.exec('ROLLBACK TO SAVEPOINT bad_bytes');
 await db.exec('SAVEPOINT corrupt');await db.query("UPDATE techsafe_source.application_observations SET equipment_before_facts=jsonb_set(equipment_before_facts,'{lines,0,unitSalePrice}','\"999.00\"'::jsonb) WHERE id=$1",[observation]);assert.equal(await read(),null);await db.exec('ROLLBACK TO SAVEPOINT corrupt');
 for(const update of ["enabled=false","status='paused'","status='revoked'","last_verified_at=now()-interval '6 minutes'"]){await db.exec('SAVEPOINT health');await db.exec('UPDATE techsafe_source.integration_connections SET '+update);assert.equal(await read(),null);await db.exec('ROLLBACK TO SAVEPOINT health');}
 assert.equal(await read(id(999)),null);assert.equal(await read(connection,id(999)),null);
 await db.query("SELECT set_config('test.actor',$1,false)",[outsider]);assert.equal(await read(),null);await db.query("SELECT set_config('test.actor',$1,false)",[actor]);
 for(const role of ['anon','authenticated','service_role']){await db.exec('SAVEPOINT role_test;SET LOCAL ROLE '+role);await assert.rejects(read(),e=>e.code==='42501');await db.exec('ROLLBACK TO SAVEPOINT role_test');}
 // Verify early readiness rejects before approval lookup.
 await db.exec('SAVEPOINT early');await db.exec("UPDATE sales_orders SET status='active';UPDATE projects SET substantial_completion_date=NULL;CREATE OR REPLACE FUNCTION techsafe_source.read_portal_approval_equipment_basis(p_connection uuid,p_order uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Approval lookup must not run';END$$;");assert.equal(await read(),null);await db.exec('ROLLBACK TO SAVEPOINT early');
 // Oversized history must be rejected from counters before any fact rehash.
 await db.exec('SAVEPOINT budget');await db.query("INSERT INTO proposal_line_items(organization_id,proposal_id,product_id,item_type,quantity,unit_price,is_customer_supplied,description,is_hidden) SELECT $1,$2,$3,'material',1,800,false,repeat('X',12000),false FROM generate_series(1,20)",[org,proposal,product]);
 const large=await begin();assert.ok(large);assert.equal(await finish(large),large);
 await db.query(`INSERT INTO techsafe_source.application_observations SELECT (jsonb_populate_record(NULL::techsafe_source.application_observations,
  to_jsonb(o)||jsonb_build_object('id',gen_random_uuid(),'equipment_started_order',10000+n*2,'equipment_completed_order',10001+n*2))).*
  FROM techsafe_source.application_observations o CROSS JOIN generate_series(1,20) n WHERE o.id=$1`,[large]);
 await db.exec("CREATE OR REPLACE FUNCTION techsafe_source.equipment_facts_evidence(p_facts jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Over-budget fact rehash must not run';END$$;");assert.equal(await read(),null);await db.exec('ROLLBACK TO SAVEPOINT budget');
 const attrs=(await db.query("SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='techsafe_source.read_draft_candidate_inputs(uuid,uuid)'::regprocedure")).rows[0];assert.equal(attrs.prosecdef,false);assert.equal(attrs.provolatile,'s');assert.deepEqual(attrs.proconfig,['search_path=""']);
 const before=JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows);await read();assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(so) AS row FROM sales_orders so')).rows),before);
 await db.exec('ROLLBACK');
 console.log('Candidate input bundle passed: bound ready-order original/current/pair reads in one statement, direct/applied preparation, byte metadata integrity/no backfill, parity with existing pair validation, missing/corrupt/oversized/early/health/tenant/API holds and no source writes.');
}
