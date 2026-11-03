import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { transform } from 'esbuild';
const dirs=await readdir('supabase/functions',{withFileTypes:true});let routed=0;
for(const dir of dirs){if(!dir.isDirectory())continue;for(const file of await readdir(`supabase/functions/${dir.name}`)){if(!file.endsWith('.ts'))continue;const path=`supabase/functions/${dir.name}/${file}`;const source=await readFile(path,'utf8');
 await transform(source,{loader:'ts',target:'es2022'});
 if(file!=='system-email.ts')assert.ok(!/fetch\((['"`])https:\/\/api\.resend\.com\/emails\1/.test(source),`${path} bypasses system transport`);
 assert.ok(!source.includes('api.sendgrid.com'),`${path} uses another provider`);
 if(source.includes('sendSystemEmail('))routed++;
}}
assert.ok(routed>=26);console.log(`${routed} outbound email modules use one transport; all edge TypeScript parses.`);
