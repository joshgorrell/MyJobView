import assert from 'node:assert/strict';
import { classifyInvoiceOnlyQboPayment as classify } from '../../supabase/functions/_shared/qbo-invoice-payment-classification.ts';
const line = (Amount, TxnId, TxnType='Invoice') => ({Amount,LinkedTxn:[{TxnId,TxnType}]});
const payment=(TotalAmt,Line,UnappliedAmt=0)=>({TotalAmt,UnappliedAmt,Line});
assert.deepEqual(classify(payment(30,[line(10,'1'),line(20,'2')])),{ok:true,allocations:[{invoiceId:'1',principalCents:1000},{invoiceId:'2',principalCents:2000}]});
assert.deepEqual(classify(payment('0.30',[line('0.10','1'),line('0.20','1')])),{ok:true,allocations:[{invoiceId:'1',principalCents:30}]});
for(const input of [
  payment(30,[{Amount:30,LinkedTxn:[{TxnId:'1',TxnType:'Invoice'},{TxnId:'2',TxnType:'Invoice'}]}]),
  payment(30,[line(30,'1','CreditMemo')]),payment(30,[line(29,'1')]),payment(30,[line(20,'1')],10),
  payment(30,[line(30.001,'1')]),payment(30,[line(-30,'1')]),payment(30,[]),payment(30,[line(30,'')]),
  {TotalAmt:30,Line:[line(30,'1')]},
]) assert.equal(classify(input).ok,false);
console.log('QuickBooks invoice-only allocation classification checks passed');
