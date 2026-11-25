import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='public/website-widgets/';
for(const file of readdirSync(root).filter(f=>f.endsWith('.js'))){
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:readFileSync(root+file,'utf8'),encoding:'utf8'});
 assert.equal(result.status,0,file+': '+result.stderr);
}
const runtime=readFileSync(root+'runtime.js','utf8');
for(const kind of ['sales-lead','service','feedback','chat','portal','analytics']){
 assert.ok(runtime.includes("'"+kind+"'"),kind+' runtime missing');
 assert.ok(readFileSync(root+kind+'.js','utf8').includes(kind),kind+' entry missing');
}
const config=readFileSync('supabase/config.toml','utf8');
for(const endpoint of ['website-widget-config','submit-website-lead','submit-website-service','submit-website-feedback','website-chat','website-analytics']){
 assert.match(config,new RegExp('\\[functions\\.'+endpoint+'\\]\\s*verify_jwt\\s*=\\s*false'));
 const source=readFileSync('supabase/functions/'+endpoint+'/index.ts','utf8');
 assert.ok(source.includes('allowed_origins'),endpoint+' missing origin validation reference');
}
console.log('Widget runtime syntax and endpoint wiring checks passed');
