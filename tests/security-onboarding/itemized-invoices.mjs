import assert from 'node:assert/strict';
export async function testItemizedInvoices(db,contractId,generate) {
 const original=(await db.query('select onboarding_agreement_snapshot snapshot from security_contracts where id=$1',[contractId])).rows[0].snapshot;
 const services=[{service_id:'10000000-0000-0000-0000-000000000001',name:'Central station monitoring',monthly_price:35},{service_id:'10000000-0000-0000-0000-000000000002',name:'Alarm.com cellular service',monthly_price:15}];
 for(const scenario of [
  {monthly:50,mode:'monthly',fee:0,services,expected:[35,15]},
  {monthly:50.01,mode:'monthly',fee:0,services,expected:[35.01,15]},
  {monthly:50,mode:'annual',fee:0,services,discountType:'percentage',discount:10,expected:[378,162]},
  {monthly:50,mode:'annual',fee:0,services,discountType:'flat',discount:5,expected:[416.5,178.5]},
  {monthly:57,mode:'annual',fee:7,services,discountType:'percentage',discount:10,expected:[378,162,84]},
  {monthly:0.02,mode:'monthly',fee:0,services:[1,2,3,4].map(n=>({name:'Service '+n,monthly_price:1})),expected:[0.01,0.01,0,0]},
  {monthly:35,mode:'monthly',fee:0,services:[],expected:[35]},
 ]) {
  await db.query('update invoices set security_billing_cycle_id=null where id in(select invoice_id from security_billing_cycles where contract_id=$1)',[contractId]);
  await db.query('delete from security_billing_cycles where contract_id=$1',[contractId]);
  const snapshot={...original,monthly_price:scenario.monthly,mail_invoice_fee:scenario.fee,billingPreference:scenario.mode,services:scenario.services,
   dealer:{...original.dealer,annual_discount_type:scenario.discountType||'percentage',annual_discount_percentage:scenario.discount||0,annual_discount_flat_amount:scenario.discount||0}};
  await db.exec("SET mjv.security_signing='true'; SET mjv.security_billing='true'");
  await db.query('update security_contracts set onboarding_agreement_snapshot=$2,security_billing_period=0 where id=$1',[contractId,JSON.stringify(snapshot)]);
  await db.exec("SET mjv.security_signing='false'; SET mjv.security_billing='false'");
  assert.equal((await generate()).generated,1);assert.equal((await generate()).generated,0,'Repeated scheduler run cannot create another invoice for that period');
  const lines=(await db.query('select l.* from invoice_line_items l join security_billing_cycles b on b.invoice_id=l.invoice_id where b.contract_id=$1 order by l.sort_order',[contractId])).rows;
  assert.deepEqual(lines.map(l=>Number(l.amount)),scenario.expected);
  const invoice=(await db.query('select i.* from invoices i join security_billing_cycles b on b.invoice_id=i.id where b.contract_id=$1',[contractId])).rows[0];
  assert.equal(lines.reduce((sum,l)=>Math.round(sum+Number(l.amount)*100),0),Math.round(Number(invoice.subtotal)*100));
  for(let n=0;n<scenario.services.length;n++){assert.ok(lines[n].description.includes(scenario.services[n].name));assert.equal(lines[n].security_service_name,scenario.services[n].name);assert.equal(lines[n].security_service_id,scenario.services[n].service_id||null);assert.ok(lines[n].description.includes(scenario.mode));assert.ok(lines[n].description.includes(' through '));assert.ok(lines[n].description.includes('agreement '));}
 }
 const cycle=(await db.query('select * from security_billing_cycles where contract_id=$1',[contractId])).rows[0];
 await assert.rejects(db.query('insert into payments(invoice_id,organization_id,amount,payment_method,security_billing_cycle_id) values($1,$2,$3,$4,$5)',[cycle.invoice_id,cycle.organization_id,35,'qbo_payments',cycle.id]),/must match/,'Unconfirmed automatic receipts are rejected');
 await db.exec("update security_billing_cycles set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'");
 const leased=(await db.query('select * from security_billing_cycles where id=$1',[cycle.id])).rows[0];
 await db.query('update invoices set security_billing_cycle_id=null where id=$1',[cycle.invoice_id]);
 await assert.rejects(db.query("select public.security_recurring_billing('prepare',$1,$2)",[cycle.id,JSON.stringify({lease_token:leased.lease_token})]),/matching customer invoice/);
 await db.query('update invoices set security_billing_cycle_id=$2 where id=$1',[cycle.invoice_id,cycle.id]);
 await db.query("update security_billing_cycles set next_check_at=now()+interval '1 day' where id<>$1",[cycle.id]);
 await db.query("update security_billing_cycles set state='mail',billing_mode='mail',accounting_synced_at=null,lease_token=null,lease_until=null,next_check_at=now() where id=$1",[cycle.id]);
 const mail=(await db.query("select public.security_recurring_billing('lease',null,'{}') result")).rows[0].result;
 assert.equal(mail.id,cycle.id,'Mailed invoices are leased for accounting synchronization');
 const receiptCount=(await db.query('select count(*) from payments')).rows[0].count;
 await assert.rejects(db.query("select public.security_recurring_billing('mail_accounting',$1,$2)",[cycle.id,JSON.stringify({lease_token:mail.lease_token})]),/synchronized mailed invoice/);
 await db.query("update invoices set qbo_invoice_id='qb-mailed-invoice' where id=$1",[cycle.invoice_id]);
 await db.query("select public.security_recurring_billing('mail_accounting',$1,$2)",[cycle.id,JSON.stringify({lease_token:mail.lease_token})]);
 assert.ok((await db.query('select accounting_synced_at from security_billing_cycles where id=$1',[cycle.id])).rows[0].accounting_synced_at);
 assert.equal((await db.query('select count(*) from payments')).rows[0].count,receiptCount,'Mailed invoice sync does not manufacture a payment');
 assert.equal((await db.query("select public.security_recurring_billing('lease',null,'{}') result")).rows[0].result,null,'Synced mailed invoice is not replayed');
 console.log('Itemized billing tests passed: service descriptions, monthly/annual costs, override rounding, discounts, fees, single invoice per period, and invoice/payment linkage guards.');
}
