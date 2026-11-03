import {summarizeCapture} from './catalog-capture.mjs';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
export function compileTriggerLayer(pages){
 summarizeCapture(pages);const triggers=[];
 for(const page of pages.filter(p=>p.kind==='relations'))for(const row of page.rows){
  const o=JSON.parse(row.payload_text);if(o.kind!=='r')continue;
  for(const t of o.triggers??[]){
   if(!['O','D','R','A'].includes(t.enabled)||!/^CREATE (CONSTRAINT )?TRIGGER /.test(t.definition))throw new Error('Unsupported trigger');
   triggers.push({identity:row.identity,name:t.name,sourceEnabled:t.enabled,definition:t.definition,
    quarantineSql:`ALTER TABLE ${qi(o.schema)}.${qi(o.name)} DISABLE TRIGGER ${qi(t.name)};`,
    enableSql:`ALTER TABLE ${qi(o.schema)}.${qi(o.name)} ${t.enabled==='D'?'DISABLE':t.enabled==='R'?'ENABLE REPLICA':t.enabled==='A'?'ENABLE ALWAYS':'ENABLE'} TRIGGER ${qi(t.name)};`});
  }
 }return {triggers,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
export async function rehearseTriggerLayer(db,plan){
 const installed=[],failures=[];await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
 try{for(const t of plan.triggers){await db.exec('SAVEPOINT trigger_item;');
  try{await db.exec(t.definition);await db.exec(t.quarantineSql);await db.exec('RELEASE SAVEPOINT trigger_item;');installed.push({identity:t.identity,name:t.name,sourceEnabled:t.sourceEnabled,enabled:'D'});}
  catch(error){await db.exec('ROLLBACK TO SAVEPOINT trigger_item; RELEASE SAVEPOINT trigger_item;');failures.push({identity:t.identity,name:t.name,sqlState:error.code??null});}
 }await db.exec('COMMIT;');}catch(error){await db.exec('ROLLBACK;');throw error;}
 return {installed,failures,allDisabled:true,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
