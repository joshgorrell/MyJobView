import {summarizeCapture} from './catalog-capture.mjs';
const qi=s=>'"'+s.replaceAll('"','""')+'"';
// Trusted offline catalog definitions only. No connected-database deployment path.
export function compileConstraintLayer(pages){
 summarizeCapture(pages);
 const statements=[],deferred=[];
 for(const page of pages.filter(p=>p.kind==='relations'))for(const row of page.rows){
  const o=JSON.parse(row.payload_text);if(o.kind!=='r')continue;
  const table=qi(o.schema)+'.'+qi(o.name);
  for(const c of o.constraints??[]){
   if(c.kind==='t'){deferred.push({stage:'constraints',identity:row.identity,name:c.name,reason:'constraint-trigger-review'});continue;}
   if(!['p','u','c','f'].includes(c.kind)||typeof c.definition!=='string'||!c.definition||typeof c.validated!=='boolean')throw new Error('Unsupported constraint');
   statements.push({stage:c.kind==='f'?'foreignKeys':c.kind==='c'?'checks':'keys',identity:row.identity,name:c.name,
    sql:`ALTER TABLE ${table} ADD CONSTRAINT ${qi(c.name)} ${c.definition};`});
  }
  for(const i of o.indexes??[]){
   if(i.valid!==true||i.ready!==true)throw new Error('Invalid or incomplete source index');
   if(typeof i.definition!=='string'||!/^CREATE (UNIQUE )?INDEX /.test(i.definition))throw new Error('Unsupported index');
   statements.push({stage:'indexes',identity:row.identity,name:i.name,schema:o.schema,sql:i.definition});
  }
 }
 const rank={keys:0,checks:1,foreignKeys:2,indexes:3};statements.sort((a,b)=>rank[a.stage]-rank[b.stage]);
 return {format:'mjv-constraint-layer-v1',statements,deferred,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}

// Diagnostic test helper. Callers use fresh local in-memory PGlite only.
export async function rehearseConstraintLayer(db,plan){
 const applied=[],failures=[];
 await db.exec('BEGIN; SET LOCAL search_path=public,pg_catalog;');
 try{
  for(const item of plan.statements){
   await db.exec('SAVEPOINT structure_item;');
   try{
    let reused=false;
    if(item.stage==='indexes'){
     const rows=(await db.query(`SELECT CASE WHEN i.indexrelid IS NOT NULL THEN pg_get_indexdef(c.oid) END AS definition,i.indisvalid AS valid,i.indisready AS ready
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_index i ON i.indexrelid=c.oid
      WHERE n.nspname=$1 AND c.relname=$2`,[item.schema,item.name])).rows;
     if(rows.length){
      if(rows[0].definition!==item.sql||rows[0].valid!==true||rows[0].ready!==true)throw Object.assign(new Error('Existing index mismatch'),{diagnostic:'index-definition-mismatch'});
      reused=true;
     }
    }
    if(!reused)await db.exec(item.sql);
    await db.exec('RELEASE SAVEPOINT structure_item;');
    applied.push({stage:item.stage,identity:item.identity,name:item.name,reused});
   }catch(error){
    await db.exec('ROLLBACK TO SAVEPOINT structure_item; RELEASE SAVEPOINT structure_item;');
    failures.push({stage:item.stage,identity:item.identity,name:item.name,sqlState:error.code??null,...(error.diagnostic?{reason:error.diagnostic}:{})});
   }
  }
  await db.exec('COMMIT;');
 }catch(error){await db.exec('ROLLBACK;');throw error;}
 return {applied,failures,deferred:plan.deferred,fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false};
}
