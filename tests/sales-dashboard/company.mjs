import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(entry) {
  const built = await build({entryPoints:[entry],bundle:true,format:'esm',write:false});
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
}
const {salesDashboardScope} = await load('src/lib/salesDashboardScope.ts');
const rep = {id:'rep',role:'sales_rep',is_sales_rep:true};
assert.equal(salesDashboardScope(rep,undefined).repId,'rep');
assert.equal(salesDashboardScope(rep,'another').repId,'rep');
assert.equal(salesDashboardScope({...rep,role:'admin'},undefined).repId,'rep');
assert.equal(salesDashboardScope({...rep,role:'manager'},undefined).repId,'rep');
for (const role of ['admin','manager','sales_manager']) {
  const manager = {id:'manager',role,is_sales_rep:false};
  assert.equal(salesDashboardScope(manager,undefined).allSales,true);
  assert.equal(salesDashboardScope(manager,'rep').repId,'rep');
  assert.equal(salesDashboardScope(manager,null).allSales,true);
}
assert.equal(salesDashboardScope({id:'other',role:'technician'},undefined).allSales,false);
assert.equal(salesDashboardScope(null,undefined).allSales,false);
const {companySalesDashboard} = await load('src/lib/companySalesDashboard.ts');
const {buildSalesLists,recordTotal} = await load('src/lib/salesDashboardRecords.ts');
const source = {timezone:'America/Chicago',proposals:[],leads:[],contacts:[],connections:[],occurrences:[],
  months:[{id:'import',user_id:'rep1',year:2026,month:10,total_sales:1000,sales_order_count:2}],
  orders:[{id:'covered',sales_rep_id:'rep1',created_by:'admin',created_at:'2026-10-02',contract_total:1000,status:'active'},
    {id:'native',sales_rep_id:'rep2',created_by:'admin',created_at:'2026-10-03',contract_total:500,status:'active'},
    {id:'cancelled',sales_rep_id:'rep2',created_at:'2026-10-03',contract_total:999,status:'cancelled'}]};
const now = new Date('2026-10-21T12:00:00Z');
const data = companySalesDashboard(source,now);
assert.equal(data.bookedSales.total,1500);
assert.equal(data.bookedSales.count,3);
assert.equal(data.monthlyTrend[0].total,1500);
assert.equal(data.quota.quotaStartDate,'2026-01-01');
assert.equal(data.quota.hasQuota,false);
const lists = buildSalesLists(source,'month',data.quota,now);
assert.equal(recordTotal(lists.booked),1500);
assert.equal(recordTotal(lists.runRate),1500);
assert.deepEqual(lists.booked.map(r=>r.id).sort(),['import','native']);
console.log('PASS: designation-based defaults, manager filtering, company totals/trends, and per-rep import precedence.');
