import { useCallback, useEffect, useState } from 'react';
import { securityPaymentRequest, type SecurityPaymentMethod } from '../../lib/securityOnboarding';

interface Props {
  contractId: string; token: string; selectedId: string;
  onSelect: (method: SecurityPaymentMethod) => void;
}

export default function SecurityPaymentEnrollment({contractId,token,selectedId,onSelect}: Props) {
  const [methods,setMethods]=useState<SecurityPaymentMethod[]>([]);
  const [environment,setEnvironment]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [showAdd,setShowAdd]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await securityPaymentRequest<{methods:SecurityPaymentMethod[];environment:string}>('list',contractId,token);
      setMethods(result.methods.filter(m=>m.payment_type==='ach' || (m.exp_year && m.exp_month && new Date(m.exp_year,m.exp_month,1)>new Date())));
      setEnvironment(result.environment);
    } catch(e) {setError(e instanceof Error ? e.message : 'Unable to load payment methods');}
    finally {setLoading(false);}
  },[contractId,token]);
  useEffect(()=>{void load();},[load]);
  return <div className="space-y-4">
    <p className="text-sm text-gray-700">A payment method on file and automatic recurring payments are required for security monitoring. Select an existing method or securely add a card or bank account.</p>
    {environment === 'sandbox' && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Test mode: use QuickBooks sandbox card or bank details. This does not enroll a live payment method.</p>}
    {loading && <p role="status">Loading payment methods…</p>}
    {error && <div role="alert" className="bg-red-50 text-red-800 rounded-xl p-4">{error}<button onClick={()=>void load()} className="underline ml-3">Retry payment methods</button></div>}
    {methods.map(method=><button key={method.id} onClick={()=>onSelect(method)} className={`block w-full text-left border-2 p-4 rounded-xl ${selectedId===method.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      {method.display_brand} ending {method.display_last4}{method.payment_type==='card' && <span className="text-sm text-gray-600"> · Expires {method.exp_month}/{method.exp_year}</span>}
      {selectedId===method.id && <span className="block text-blue-900 text-sm font-semibold">Selected for AutoPay</span>}
    </button>)}
    {!loading && !error && methods.length===0 && <p className="text-gray-600">No eligible payment methods are on file.</p>}
    {!!environment && !showAdd && <button onClick={()=>setShowAdd(true)} className="px-4 py-3 bg-blue-900 text-white rounded-xl font-semibold">Add payment method</button>}
    {showAdd && <NewMethod key={environment} environment={environment} contractId={contractId} token={token}
      onCancel={()=>setShowAdd(false)} onAdded={m=>{setMethods(prev=>[...prev.filter(p=>p.id!==m.id),m]);onSelect(m);setShowAdd(false);}} />}
    <p className="text-xs text-gray-600">Card and bank numbers are sent directly to QuickBooks Payments. They are never included in your saved onboarding draft. Adding a method does not charge it.</p>
  </div>;
}

function NewMethod({environment,contractId,token,onAdded,onCancel}:{environment:string;contractId:string;token:string;onAdded:(m:SecurityPaymentMethod)=>void;onCancel:()=>void}) {
  const [type,setType]=useState<'card'|'ach'>('card');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function add(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=event.currentTarget;const values=new FormData(form);
    const value=(name:string)=>String(values.get(name)||'');
    setBusy(true);setError('');
    try {
      const payload=type==='card' ? {card:{name:value('name'),number:value('number').replace(/\s/g,''),expMonth:value('expMonth'),expYear:value('expYear'),cvc:value('cvc'),
        address:{streetAddress:value('streetAddress'),city:value('city'),region:value('region'),postalCode:value('postalCode'),country:'US'}}}
        : {bankAccount:{name:value('name'),routingNumber:value('routingNumber'),accountNumber:value('accountNumber'),accountType:value('accountType'),phone:value('phone'),country:'US'}};
      const origin=environment==='production' ? 'https://api.intuit.com' : 'https://sandbox.api.intuit.com';
      const response=await fetch(origin+'/quickbooks/v4/payments/tokens',{
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Request-Id':crypto.randomUUID()},body:JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('QuickBooks could not tokenize these details. Check them and try again.');
      const result=await response.json();
      if (!result.value) throw new Error('QuickBooks did not return a payment token');
      // Clear sensitive fields immediately after tokenization, even if vault storage fails.
      form.reset();
      const saved=await securityPaymentRequest<{method:SecurityPaymentMethod}>('add',contractId,token,{paymentType:type,tokenValue:result.value});
      onAdded(saved.method);
    } catch(e) {setError(e instanceof Error ? e.message : 'Payment method could not be added');}
    finally {setBusy(false);}
  }
  const field=(name:string,label:string,props:React.InputHTMLAttributes<HTMLInputElement>={})=><label className="block text-sm font-medium text-gray-700">{label}<input name={name} required disabled={busy} className="block w-full mt-1 border border-gray-300 rounded-lg px-3 py-3 bg-white" {...props}/></label>;
  return <form onSubmit={add} className="border border-gray-200 rounded-xl p-4 space-y-4" autoComplete="off">
    <h3 className="font-semibold text-gray-900">Add payment method</h3>
    <label className="block text-sm font-medium">Method<select aria-label="Payment method type" value={type} disabled={busy} onChange={e=>{setType(e.target.value as 'card'|'ach');setError('');}} className="block w-full border rounded-lg p-3 mt-1"><option value="card">Credit / debit card</option><option value="ach">Bank account (ACH)</option></select></label>
    <div key={type} className="space-y-3">
      {field('name',type==='card' ? 'Name on card' : 'Account holder name',{maxLength:100})}
      {type==='card' ? <>
        {field('number','Card number',{inputMode:'numeric',pattern:'[0-9 ]{12,23}',maxLength:23})}
        <div className="grid grid-cols-2 gap-3">{field('expMonth','Expiration month',{type:'number',min:1,max:12})}{field('expYear','Expiration year',{type:'number',min:new Date().getFullYear(),max:new Date().getFullYear()+30})}</div>
        {field('cvc','Security code',{type:'password',inputMode:'numeric',pattern:'[0-9]{3,4}',maxLength:4})}
        {field('streetAddress','Billing street address',{maxLength:300})}{field('city','Billing city',{maxLength:100})}
        <div className="grid grid-cols-2 gap-3">{field('region','Billing state',{pattern:'[a-zA-Z]{2}',maxLength:2})}{field('postalCode','Billing ZIP',{pattern:'[0-9]{5}(-[0-9]{4})?',maxLength:10})}</div>
      </> : <>
        {field('routingNumber','Routing number',{inputMode:'numeric',pattern:'[0-9]{9}',maxLength:9})}
        {field('accountNumber','Account number',{type:'password',inputMode:'numeric',pattern:'[0-9]{4,17}',maxLength:17})}
        {field('phone','Account holder phone',{type:'tel',maxLength:40})}
        <label className="block text-sm font-medium">Account type<select name="accountType" className="block w-full border rounded-lg p-3 mt-1" disabled={busy}><option value="PERSONAL_CHECKING">Personal checking</option><option value="PERSONAL_SAVINGS">Personal savings</option><option value="BUSINESS_CHECKING">Business checking</option><option value="BUSINESS_SAVINGS">Business savings</option></select></label>
      </>}
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="bg-blue-900 text-white px-4 py-3 rounded-lg disabled:opacity-50">{busy ? 'Saving payment method…' : 'Save payment method'}</button><button type="button" disabled={busy} onClick={onCancel} className="border rounded-lg px-4 py-3">Cancel</button></div>
    <p className="text-xs text-gray-600">If you pause now, entered payment numbers will need to be entered again. Once saved, your masked payment method will be available when you resume.</p>
  </form>;
}
