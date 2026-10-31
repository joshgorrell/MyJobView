import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {captureKinds,captureQuery} from '../../../scripts/techsafe/catalog-capture.mjs';
import {compileTableLayer} from '../../../scripts/techsafe/restore-table-layer.mjs';
import {compileDefinitionLayer,rehearseDefinitionLayer} from '../../../scripts/techsafe/restore-definition-layer.mjs';
import {compileConstraintLayer,rehearseConstraintLayer} from '../../../scripts/techsafe/restore-constraint-layer.mjs';
import {compileLocalAuthInterface} from '../../../scripts/techsafe/local-auth-interface.mjs';
import {compileAccessLayer,rehearseAccessLayer} from '../../../scripts/techsafe/restore-access-layer.mjs';
import {compilePrivilegeLayer,rehearsePrivilegeLayer,decodeAcl} from '../../../scripts/techsafe/restore-privilege-layer.mjs';
import {compileTriggerLayer,rehearseTriggerLayer} from '../../../scripts/techsafe/restore-trigger-layer.mjs';
export async function capturedSourceDb(directory){
 const pages=captureKinds.flatMap(kind=>JSON.parse(fs.readFileSync(path.join(directory,kind+'.json'),'utf8')).pages);
 const metadata=JSON.parse(fs.readFileSync(path.join(directory,'metadata.json'),'utf8')),
  extra=JSON.parse(fs.readFileSync(path.join(directory,'extra-metadata.json'),'utf8'));
 const db=new PGlite();try{
  const auth=compileLocalAuthInterface(JSON.parse(fs.readFileSync('tests/techsafe/fixtures/auth-interface-catalog.json','utf8')));
  await db.exec('BEGIN;');for(const sql of auth.statements)await db.exec(sql);
  for(const item of compileTableLayer(pages,extra).statements)await db.exec(item.sql);await db.exec('COMMIT;');
  const definitions=await rehearseDefinitionLayer(db,compileDefinitionLayer(pages));
  const constraints=await rehearseConstraintLayer(db,compileConstraintLayer(pages));
  const access=await rehearseAccessLayer(db,compileAccessLayer(pages));
  const privileges=await rehearsePrivilegeLayer(db,compilePrivilegeLayer(pages,metadata));
  const restored=[];for(const kind of captureKinds)for(let offset=0;;offset+=25){const rows=(await db.query(captureQuery(kind,offset,25))).rows;if(!rows.length)break;restored.push(...rows.map(r=>({kind,identity:r.identity,...JSON.parse(r.payload_text)})));}
  const nativeSchemas=(await db.query(fs.readFileSync('scripts/techsafe/catalog-capture-metadata.sql','utf8'))).rows[0].metadata.schemas;
  const original=new Map(pages.flatMap(p=>p.rows.map(r=>[r.identity,JSON.parse(r.payload_text)]))),mismatches=[];
  const normalized=(acl,kind,owner)=>decodeAcl(acl,kind,owner).map(g=>JSON.stringify(g)).sort();
  let columnsCompared=0;
  for(const object of privileges.applied){
   const expected=object.kind==='SCHEMA'?metadata.schemas.find(x=>x.name===object.identity):original.get(object.identity);
   const actual=object.kind==='SCHEMA'?nativeSchemas.find(x=>x.name===object.identity):restored.find(x=>x.identity===object.identity);
   if(JSON.stringify(normalized(expected.acl,object.kind,expected.owner))!==JSON.stringify(normalized(actual.acl,object.kind,actual.owner)))mismatches.push({identity:object.identity,field:'objectPrivileges'});
   for(const column of expected.columns??[]){
    const target=actual.columns.find(c=>c.name===column.name);columnsCompared++;
    const col=a=>normalized(a??[],'TABLE',expected.owner);
    if(JSON.stringify(col(column.acl))!==JSON.stringify(col(target.acl)))mismatches.push({identity:object.identity,column:column.name,field:'columnPrivileges'});
   }
  }
  privileges.comparison={objectsCompared:privileges.applied.length,columnsCompared,mismatches,grantorsVerified:false,defaultPrivilegesVerified:false};
  const triggerPlan=compileTriggerLayer(pages),triggers=await rehearseTriggerLayer(db,triggerPlan);
  const triggerMismatches=[];
  for(const t of triggers.installed){
   const expected=triggerPlan.triggers.find(x=>x.identity===t.identity&&x.name===t.name);
   const actual=(await db.query('SELECT pg_get_triggerdef(oid) AS definition,tgenabled AS enabled FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=$2',[t.identity,t.name])).rows[0];
   if(actual.definition!==expected.definition||actual.enabled!=='D')triggerMismatches.push({identity:t.identity,name:t.name,definitionMatches:actual.definition===expected.definition,disabled:actual.enabled==='D'});
  }
  triggers.comparison={compared:triggers.installed.length,mismatches:triggerMismatches};
  return {db,pages,metadata,extra,triggerPlan,reports:{definitions,constraints,access,privileges,triggers}};
 }catch(error){await db.close();throw error;}
}
