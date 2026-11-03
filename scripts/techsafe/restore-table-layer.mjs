import {summarizeCapture} from './catalog-capture.mjs';
// Offline compiler only. SQL fragments are trusted, privately reviewed catalog
// definitions, not sanitized user input. Never execute this on a connected site.
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const qn=o=>qi(o.schema)+'.'+qi(o.name);
const literal=s=>"'"+s.replaceAll("'","''")+"'";
function sequenceOptions(s){
 if(!s||!['smallint','integer','bigint'].includes(s.type)||typeof s.cycle!=='boolean')throw new Error('Unsupported sequence');
 for(const key of ['start','increment','minimum','maximum','cache'])if(!/^-?\d+$/.test(s[key]??''))throw new Error('Invalid sequence integer');
 return `START WITH ${s.start} INCREMENT BY ${s.increment} MINVALUE ${s.minimum} MAXVALUE ${s.maximum} CACHE ${s.cache} ${s.cycle?'CYCLE':'NO CYCLE'}`;
}
export function compileTableLayer(pages,{extensionOwnedRelations=[],sequenceOwnership=[]}={}){
 const summary=summarizeCapture(pages); // verifies every source-native payload hash
 const types=pages.filter(p=>p.kind==='types').flatMap(p=>p.rows.map(r=>JSON.parse(r.payload_text)));
 const rels=pages.filter(p=>p.kind==='relations').flatMap(p=>p.rows.map(r=>({identity:r.identity,...JSON.parse(r.payload_text)})));
 const excluded=new Set(extensionOwnedRelations.map(x=>x.identity));
 const sequences=new Map(rels.filter(o=>o.kind==='S').map(o=>[o.identity,o]));
 const ownership=new Map();
 for(const own of sequenceOwnership){
  if(ownership.has(own.sequence)||!sequences.has(own.sequence)||!['a','i'].includes(own.dependencyKind))throw new Error('Invalid sequence ownership');
  ownership.set(own.sequence,own);
 }
 const statements=[],deferred=[];
 const emit=(stage,identity,sql)=>statements.push({stage,identity,sql});
 const schemas=[...new Set([...rels,...types].map(o=>o.schema))].sort();
 for(const schema of schemas){
  if(['auth','storage','vault','net','cron'].includes(schema))throw new Error('Managed schema cannot be restored');
  if(schema!=='public')emit('schemas',schema,`CREATE SCHEMA ${qi(schema)};`);
 }
 for(const o of types){
  if(o.kind!=='e'||!Array.isArray(o.labels)||!o.labels.length)throw new Error('Unsupported custom type');
  emit('types',qn(o),`CREATE TYPE ${qn(o)} AS ENUM (${o.labels.map(literal).join(',')});`);
 }
 for(const o of sequences.values()){
  if(ownership.get(o.identity)?.dependencyKind==='i')continue;
  emit('sequences',o.identity,`CREATE SEQUENCE ${qn(o)} AS ${o.sequence.type} ${sequenceOptions(o.sequence)};`);
 }
 for(const o of rels){
  if(excluded.has(o.identity)){if(o.kind!=='c')throw new Error('Unexpected extension relation');continue;}
  if(o.kind==='S')continue;
  if(['v','m'].includes(o.kind)){deferred.push({kind:'view',identity:o.identity});continue;}
  if(o.kind!=='r'||o.parents?.length||o.partitionKey||o.partitionBound||!['p','u'].includes(o.persistence))throw new Error('Unsupported table structure');
  const columns=(o.columns??[]).map(c=>{
   if(!['','s'].includes(c.generated)||!['','a','d'].includes(c.identity)||c.generated&&c.identity)throw new Error('Unsupported generated/identity column');
   let sql=`${qi(c.name)} ${c.type}`;
   if(c.collation)sql+=` COLLATE ${c.collation}`;
   if(c.generated){if(!c.default)throw new Error('Missing generated expression');sql+=` GENERATED ALWAYS AS (${c.default}) STORED`;}
   else if(c.identity){
    const owned=sequenceOwnership.filter(x=>x.dependencyKind==='i'&&x.table===o.identity&&x.column===c.name);
    if(owned.length!==1)throw new Error('Missing identity sequence');
    const seq=sequences.get(owned[0].sequence);
    sql+=` GENERATED ${c.identity==='a'?'ALWAYS':'BY DEFAULT'} AS IDENTITY (SEQUENCE NAME ${qn(seq)} ${sequenceOptions(seq.sequence)})`;
   }else if(c.default!==null)deferred.push({kind:'default',identity:o.identity,column:c.name});
   if(c.notNull)sql+=' NOT NULL';
   return sql;
  });
  emit('tables',o.identity,`CREATE ${o.persistence==='u'?'UNLOGGED ':''}TABLE ${qn(o)} (\n${columns.join(',\n')}\n);`);
  // Quarantine every scaffold table, including source tables without RLS.
  emit('quarantine',o.identity,`ALTER TABLE ${qn(o)} ENABLE ROW LEVEL SECURITY;`);
  for(const kind of ['constraints','indexes','triggers','policies'])for(const item of o[kind]??[])deferred.push({kind,identity:o.identity,name:item.name});
 }
 for(const own of sequenceOwnership){
  const table=rels.find(o=>o.identity===own.table&&o.kind==='r');
  if(!table?.columns.some(c=>c.name===own.column))throw new Error('Missing sequence owner table/column');
  if(own.dependencyKind==='a')emit('ownership',own.sequence,`ALTER SEQUENCE ${qn(sequences.get(own.sequence))} OWNED BY ${qn(table)}.${qi(own.column)};`);
 }
 return {format:'mjv-table-layer-v1',sourceObjects:summary.objects.length,statements,deferred,
  counts:{tables:rels.filter(o=>o.kind==='r').length,sequences:sequences.size,enums:types.length},
  fullBaseline:false,runtimeTestsAllowed:false,restoreApproved:false,quoteReady:false,
  omitted:['ordinary defaults','views','routines','constraints','indexes','triggers','policies','source owners and ACLs','managed Auth/Storage','publications','extension objects'],
  quarantine:'All table RLS enabled; no application policies, grants, triggers, routines, credentials or data restored.'};
}
