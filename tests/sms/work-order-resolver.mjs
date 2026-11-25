import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/sms-work-order-resolver.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { resolveWorkOrderSmsAppointment } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const org='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002',contact='00000000-0000-0000-0000-000000000003';
const base={id,organization_id:org,contact_id:contact,status:'scheduled',start_date:'2026-12-03',start_time:'14:00',
scheduled_start_time:null,send_appointment_reminder:true,reminder_sms:true,reminder_sent_at:null,
contacts:{full_name:'Alex'},organizations:{name:'Dealer'}};
let row=base,lookups=[];
const db={from:table=>{assert.equal(table,'work_orders');return {select:()=>({eq:(k,v)=>{lookups.push([k,v]);return {eq:(k2,v2)=>{lookups.push([k2,v2]);return {maybeSingle:async()=>({data:row,error:null})};}};}})};}};
const result=await resolveWorkOrderSmsAppointment(db,id,org);
assert.equal(result.customerName,'Alex');
assert.equal(result.reminderRevision,'2026-12-03_14_00');
assert.deepEqual(lookups,[['id',id],['organization_id',org]]);
for(const change of [{organization_id:contact},{status:'cancelled'},{reminder_sms:false},
{send_appointment_reminder:false},{reminder_sent_at:'2026-11-01'}, {contact_id:null},
{start_date:null},{start_time:null},{contacts:null},{organizations:null}]) {
row={...base,...change};
await assert.rejects(resolveWorkOrderSmsAppointment(db,id,org));
}
row=null;await assert.rejects(resolveWorkOrderSmsAppointment(db,id,org));
console.log('Work-order SMS resolver: dealer scope and eligibility checks pass');
