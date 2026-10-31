import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capturedSourceDb} from './fixtures/captured-source-db.mjs';
if(!process.argv[2])throw new Error('Provide a privately reviewed capture directory. This test never connects to Supabase.');
const id=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
const org=id(1),actor=id(2),office=id(3),contact=id(4),proposal=id(5),order=id(6),product=id(7),line=id(8);
const migrations=['20261030162612_techsafe_product_exclusions.sql','20261030164022_techsafe_change_order_removal_provenance.sql',
 '20261030165226_techsafe_retry_safe_change_application.sql','20261030173008_techsafe_detach_legacy_workflow_hooks.sql',
 '20261030182910_techsafe_private_application_observations.sql','20261030183520_techsafe_application_observation_assessment.sql','20261030184035_techsafe_opt_in_application_observer.sql'];
async function run(observed){
 const fixture=await capturedSourceDb(process.argv[2]),{db}=fixture;try{
 const restoreFailures=Object.fromEntries(Object.entries(fixture.reports).map(([k,v])=>[k,v.failures]));
 // No trigger has run during source seeding. All constraints remain enforced.
 await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,role:'authenticated'})]);
 await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[actor,'synthetic@example.invalid']);
 await db.query('INSERT INTO public.organizations(id,name,slug) VALUES($1,$2,$3)',[org,'Synthetic dealer','synthetic-dealer']);
 await db.query("INSERT INTO public.company_settings(id,organization_id,company_name) VALUES($1,$1,'Synthetic dealer')",[org]);
 await db.query('INSERT INTO public.profiles(id,email,full_name,username,organization_id,role,is_active) VALUES($1,$2,$3,$4,$5,$6,true)',[actor,'synthetic@example.invalid','Synthetic Admin','synthetic-admin',org,'admin']);
 await db.query('INSERT INTO public.company_offices(id,organization_id,office_name) VALUES($1,$2,$3)',[office,org,'Synthetic office']);
 await db.query("INSERT INTO public.contacts(id,organization_id,contact_name,username,office_id,assigned_to,contact_type) VALUES($1,$2,'Synthetic Customer','synthetic-customer',$3,$4,'person')",[contact,org,office,actor]);
 await db.query("INSERT INTO public.products(id,organization_id,company_id,name,sku,is_active,item_type,cost) VALUES($1,$2,$2,'Synthetic Equipment','SYNTH-EQUIP',true,'material',100)",[product,org]);
 await db.query("INSERT INTO public.proposals(id,organization_id,company_id,contact_id,proposal_number,title,created_by,status,tax_rate,tax_calculation_status) VALUES($1,$2,$2,$3,'SYNTH-PROP','Synthetic proposal',$4,'designing',0,'ready')",[proposal,org,contact,actor]);
 await db.query('INSERT INTO public.proposal_settings(proposal_id,organization_id) VALUES($1,$2)',[proposal,org]);
 await db.query("INSERT INTO public.sales_orders(id,organization_id,company_id,contact_id,order_number,created_by,proposal_id,original_contract_total,contract_total) VALUES($1,$2,$2,$3,'SYNTH-ORDER',$4,$5,500,500)",[order,org,contact,actor,proposal]);
 await db.query("INSERT INTO public.proposal_line_items(id,organization_id,proposal_id,product_id,description,quantity,unit_price,line_total,cost,labor_hours,labor_rate) VALUES($1,$2,$3,$4,'Existing equipment',1,500,500,100,1,100)",[line,org,proposal,product]);
 const actions=[['modify_quantity',2,500],['modify_price',2,600],['modify_labor',2,600],['remove',2,600],['add',1,700],['modify_quantity',3,600],['modify_price',3,650],['modify_modifiers',3,650]];
 for(let n=0;n<actions.length;n++){
  const [action,quantity,price]=actions[n],co=id(100+n);
  await db.query("INSERT INTO public.change_orders(id,organization_id,company_id,sales_order_id,proposal_id,change_order_number,title,status,change_amount,tax_amount,tax_calculation_status) VALUES($1,$2,$2,$3,$4,$5,$5,'approved',0,0,'ready')",[co,org,order,proposal,'SYNTH-CO-'+n]);
  await db.query("INSERT INTO public.change_order_line_items(id,organization_id,change_order_id,action_type,proposal_line_item_id,product_id,product_name,new_quantity,new_unit_price,item_type,labor_hours,labor_rate,new_labor_total,sort_order) VALUES($1,$2,$3,$4,$5,$6,'Synthetic Equipment',$7,$8,'material',2,125,250,$9)",[id(200+n),org,co,action,action==='add'?null:line,product,quantity,price,n]);
 }
 // Local, extension-free execution only. One deferred customer-question trigger
 // cannot be installed; it is outside these tables and remains explicit.
 for(const t of fixture.triggerPlan.triggers)if(fixture.reports.triggers.installed.some(x=>x.identity===t.identity&&x.name===t.name))await db.exec(t.enableSql);
 if(observed){
  for(const migration of migrations)await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  if(process.argv.includes('--equipment-evidence'))for(const migration of ['20261031150238_techsafe_private_order_read_model.sql','20261031152939_techsafe_equipment_application_evidence.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await db.query("INSERT INTO techsafe_source.integration_connections(organization_id,connection_id,enabled,status,last_verified_at) VALUES($1,$2,true,'active',now())",[org,id(50)]);
  await db.query('INSERT INTO techsafe_source.application_observer_controls(organization_id,enabled) VALUES($1,true)',[org]);
 }
 const outcomes=[];
 async function execute(label,n,rpc='apply'){
  let error=null;try{await db.exec('BEGIN; SET LOCAL ROLE authenticated;');await db.query(rpc==='reject'?'SELECT public.reject_change_order($1,NULL)':'SELECT public.apply_change_order($1)',[id(100+n)]);await db.exec('COMMIT;');}
  catch(e){await db.exec('ROLLBACK;');error={sqlState:e.code??null};if(process.env.TECHSAFE_DIAGNOSTIC_ERRORS==='1')console.error(e.message,e.where);}
  const scope=(await db.query('SELECT product_id,description,quantity::text,unit_price::text,line_total::text,labor_total::text,is_hidden FROM public.proposal_line_items WHERE proposal_id=$1 ORDER BY description,quantity,unit_price',[proposal])).rows;
  const finance=(await db.query('SELECT parts_total::text,labor_total::text,subtotal::text,tax_amount::text,total::text,deposit_amount_due::text FROM public.proposals WHERE id=$1',[proposal])).rows[0];
  const header=(await db.query('SELECT status,is_active FROM public.change_orders WHERE id=$1',[id(100+n)])).rows[0];
  const contract=(await db.query('SELECT contract_total::text FROM public.sales_orders WHERE id=$1',[order])).rows[0];
  outcomes.push({action:label,error,scope,finance,header,contract});
 }
 for(let n=0;n<actions.length;n++)await execute(actions[n][0],n);
 await execute('retry_old_quantity_change',0);
 await execute('reject_removal',3,'reject');
 if(observed)await db.exec("CREATE OR REPLACE FUNCTION techsafe_source.try_finish_application_observation(p_co uuid,p_observation uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Synthetic finish outage';END$$;");
 await execute('finish_observer_outage',6);
 if(observed)await db.exec("CREATE OR REPLACE FUNCTION techsafe_source.try_begin_application_observation(p_co uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Synthetic begin outage';END$$;");
 await execute('begin_observer_outage',1);
 if(observed)await db.exec('DROP TABLE techsafe_source.application_observer_controls;');
 await execute('missing_observer_control',7);
 const observations=observed?(await db.query('SELECT count(*)::int AS total,count(completed_at)::int AS completed FROM techsafe_source.application_observations')).rows[0]:null;
 const incompleteAssessments=observed?(await db.query('SELECT techsafe_source.assess_application_observation(change_order_id,id) AS assessment FROM techsafe_source.application_observations WHERE completed_at IS NULL')).rows.map(x=>x.assessment):[];
 const equipmentReceipts=observed&&process.argv.includes('--equipment-evidence')?(await db.query('SELECT count(equipment_input_hash)::int AS inputs,count(equipment_after_scope_hash)::int AS scopes,count(equipment_started_order)::int AS starts,count(equipment_completed_order)::int AS completions FROM techsafe_source.application_observations')).rows[0]:null;
 if(observed)assert.equal((await db.query('SELECT count(*)::int AS n FROM techsafe_source.managed_change_orders')).rows[0].n,0);
 return {restoreFailures,privilegeComparison:fixture.reports.privileges.comparison,triggerComparison:fixture.reports.triggers.comparison,outcomes,observations,incompleteAssessments,equipmentReceipts,enabledSourceTriggers:fixture.reports.triggers.installed.length};
 }finally{await db.close();}
}
const baseline=await run(false),observed=await run(true);
assert.deepEqual(observed.outcomes,baseline.outcomes,'Observer must preserve source successes, errors, equipment and financial/header results');
assert.deepEqual(baseline.outcomes.map(x=>x.error?.sqlState??null),[null,null,null,null,'23514',null,null,null,null,null,null,null,null]);
assert.deepEqual(observed.observations,{total:9,completed:8});
assert.equal(observed.incompleteAssessments.length,1);assert.equal(observed.incompleteAssessments[0].state,'incomplete_observation');assert.equal(observed.incompleteAssessments[0].quoteReady,false);
if(process.argv.includes('--equipment-evidence'))assert.deepEqual(observed.equipmentReceipts,{inputs:9,scopes:8,starts:9,completions:8});
for(const run of [baseline,observed]){
 assert.deepEqual(run.privilegeComparison.mismatches,[]);assert.deepEqual(run.triggerComparison.mismatches,[]);
 for(const kind of ['definitions','constraints','access'])assert.deepEqual(run.restoreFailures[kind],[]);
 assert.equal(run.restoreFailures.privileges.length,6);assert.ok(run.restoreFailures.privileges.every(x=>x.sqlState==='42883'));
 assert.deepEqual(run.restoreFailures.triggers,[{identity:'public.messages',name:'on_customer_question_insert',sqlState:'42883'}]);
 assert.equal(run.enabledSourceTriggers,374);
}
console.log(JSON.stringify({baseline,observed,outcomesMatch:true,nativeSupabase:false,fullWorkflowCertified:false,quoteReady:false,productionWrites:false}));
