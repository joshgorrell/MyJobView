import assert from 'node:assert/strict';
import { build } from 'esbuild';
// Exercise the real selector's effect with a different rep first in the response.
const effects = [];
globalThis.__salesSelectorEffects = effects;
globalThis.__salesSelectorSelections = [];
const result = await build({entryPoints:['src/components/SalesDashboard/ManagerRepSelector.tsx'],bundle:true,format:'esm',write:false,jsx:'automatic',plugins:[{name:'selector-fixture',setup(b){
  b.onResolve({filter:/^react\/jsx-runtime$|^lucide-react$/},()=>({path:'jsx',namespace:'fixture'}));
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
  b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='jsx' ? 'export const jsx=()=>null;export const jsxs=()=>null;export const Users=()=>null;' : path==='react' ? 'export const forwardRef=fn=>fn; export const createElement=()=>null; export const useState=v=>[v,()=>{}]; export const useEffect=(fn,deps)=>globalThis.__salesSelectorEffects.push({fn,deps});' : `const q={select(){return q},eq(){return q},order(){return Promise.resolve({data:[{id:'other',first_name:'Other',last_name:'Rep'}],error:null})}};export const supabase={from(){return q}};`}));
}}]});
const { ManagerRepSelector } = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
ManagerRepSelector({selectedRepId:null,orgId:'org',onSelectRep:id=>globalThis.__salesSelectorSelections.push(id)});
await effects[0].fn();
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(globalThis.__salesSelectorSelections,[], 'Loading reps must never replace the signed-in user with the first rep');
assert.deepEqual(effects[0].deps,['org'], 'Changing the selected rep must not re-fetch the rep directory');
console.log('PASS: rep directory preserves My data and does not reload on rep selection.');
