// Stage only the sender's source dependency graph, preserving repository-relative
// imports for Supabase deployment and isolated Deno checks. Never stage env files.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.argv[2];
if(!out||!path.isAbsolute(out))throw Error('absolute_staging_directory_required');
const entry='supabase/functions/techsafe-send-sales-order/index.ts';
const todo=[entry],seen=new Set(),files=[];
while(todo.length){
 const rel=todo.pop();if(seen.has(rel))continue;seen.add(rel);
 const absolute=path.resolve(root,rel);
 if(!absolute.startsWith(root)||!['.mjs','.ts'].includes(path.extname(absolute)))throw Error('invalid_runtime_dependency');
 const content=await readFile(absolute,'utf8');files.push({name:rel,content});
 for(const match of content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))
  todo.push(path.relative(root,path.resolve(path.dirname(absolute),match[1])));
}
const config='supabase/functions/techsafe-send-sales-order/deno.json';
files.push({name:config,content:await readFile(path.join(root,config),'utf8')});
for(const file of files){const dest=path.join(out,file.name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,file.content);}
await writeFile(path.join(out,'runtime-files.json'),JSON.stringify(files));
console.log(`Staged ${files.length} native sender source files`);
