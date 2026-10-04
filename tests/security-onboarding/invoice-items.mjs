import assert from 'node:assert/strict';
export async function testInvoiceItems(resolve) {
 const mappings=new Map(),items=new Map(),calls=[],scopes=[];
 let saveFails=false,queryFails=false;
 const admin={from:()=>{const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},maybeSingle:async()=>{scopes.push({...filters});return {data:mappings.get(filters.local_id)||null,error:null};},upsert:async row=>{if(saveFails)return {error:{message:'unavailable'}};mappings.set(row.local_id,{qbo_id:row.qbo_id});return {error:null};}};return q;}};
 const connection={organization_id:'org',realm_id:'company-a',environment:'sandbox',security_monitoring_item_id:'seed'};
 const lines=[{security_service_id:'cms',security_service_name:'Basic CMS Monitoring',sort_order:1,description:'Accepted CMS description',amount:35,quantity:1,unit_price:35},{security_service_id:'cell',security_service_name:'Cellular Backup',sort_order:2,description:'Accepted cellular description',amount:15,quantity:1,unit_price:15},{security_service_id:null,security_service_name:'Mailed invoice fee',sort_order:3,amount:7,quantity:1,unit_price:7}];
 const request=async(_a,_c,method,path,body)=>{
  calls.push({method,path,body});
  if(path==='item/seed')return {ok:true,data:{Item:{Id:'seed',Active:true,IncomeAccountRef:{value:'income-monitoring'}}}};
  if(path.startsWith('query?'))return {ok:!queryFails,data:{QueryResponse:{Item:[]}}};
  if(method==='POST'){const item={Id:'item-'+items.size,Name:body.Name,Type:'Service',Active:true};items.set(item.Id,item);return {ok:true,data:{Item:item}};}
  return {ok:true,data:{Item:items.get(path.slice(5))}};
 };
 const resolved=await resolve(admin,connection,[lines[2],lines[0],lines[1]],request);
 assert.deepEqual(resolved.map(l=>l.description),lines.map(l=>l.description));
 assert.equal(new Set(resolved.map(l=>l.qbo_item_id)).size,3);
 assert.deepEqual(resolved.map(l=>l.amount),[35,15,7]);
 assert.equal(calls.filter(c=>c.path==='item/seed').length,1,'Income account read once');
 const creates=calls.filter(c=>c.method==='POST');assert.equal(creates.length,3);
 assert.deepEqual(creates.map(c=>c.body.Name),lines.map(l=>l.security_service_name));
 assert.ok(creates.every(c=>c.body.Type==='Service' && c.body.IncomeAccountRef.value==='income-monitoring' && !('UnitPrice' in c.body)),'New item account is copied; catalog prices cannot overwrite contract prices');
 await resolve(admin,connection,lines,request);assert.equal(calls.filter(c=>c.method==='POST').length,3,'Saved mapping is reused');
 assert.ok(scopes.every(s=>s.organization_id==='org' && s.entity_type==='item' && s.local_id.includes('sandbox:company-a:')));
 const before=calls.length;await assert.rejects(resolve(admin,connection,[{...lines[0],security_service_id:null}],request),/accepted service/);assert.equal(calls.length,before);
 items.get(resolved[0].qbo_item_id).Active=false;queryFails=true;
 await assert.rejects(resolve(admin,connection,[lines[0]],request),/could not be checked/,'Unavailable QB item does not fall back to bundled billing');
 queryFails=false;saveFails=true;
 await assert.rejects(resolve(admin,{...connection,realm_id:'company-b'},[lines[1]],request),/could not be saved/);
 assert.ok(calls.filter(c=>c.method==='POST').at(-1).path!==creates[1].path,'A different QB company has a separate item creation key');
 console.log('Invoice item tests passed: separate named services/fees, accepted costs, income account, sorted lines, stable mappings, company/environment scope, and safe failure without shared-item fallback.');
}
