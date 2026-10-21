import assert from 'node:assert/strict';
import {build} from 'esbuild';
globalThis.salesQueries=[];
globalThis.salesEffects=[];
const built = await build({entryPoints:['src/hooks/useSalesDashboardRecords.ts'],bundle:true,format:'esm',write:false,plugins:[{name:'query-fixture',setup(b){
  b.onResolve({filter:/^react$|^\.\/supabase$|^\.\.\/lib\/supabase$|^\.\.\/lib\/timezoneUtils$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='react' ? 'export const useEffect=fn=>globalThis.salesEffects.push(fn);export const useState=v=>[v,()=>{}];' : path.includes('timezoneUtils') ? 'export const getOrganizationTimezone=async()=>"UTC";' : `export const supabase={from(table){const entry={table,filters:[]};globalThis.salesQueries.push(entry);const q={select(){return q},eq(k,v){entry.filters.push([k,v]);return q},or(v){entry.filters.push(['or',v]);return q},order(){return q},range(){return Promise.resolve({data:[],error:null})}};return q}};`}));
}}]});
const {useSalesDashboardRecords} = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
for (const [rep,allSales] of [['rep1',false],[null,true]]) {
  globalThis.salesQueries=[];globalThis.salesEffects=[];
  useSalesDashboardRecords(rep,'org1',0,allSales);
  globalThis.salesEffects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(globalThis.salesQueries.length,7);
  for (const q of globalThis.salesQueries) {
    assert.ok(q.filters.some(([k,v])=>k==='organization_id'&&v==='org1'),q.table+' must remain tenant-scoped');
    const repFilters=q.filters.filter(([k])=>['created_by','assigned_to','user_id','schedule.created_by_user_id','or'].includes(k));
    assert.equal(repFilters.length,allSales?0:1,q.table+' must follow the selected sales scope');
  }
}
console.log('PASS: every source keeps tenant isolation and applies rep filters only in individual views.');
