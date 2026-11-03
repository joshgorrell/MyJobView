import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { servicePaymentRequest } from '../../lib/serviceApproval';
import SecurityPaymentEnrollment from './SecurityPaymentEnrollment';
import type { SecurityPaymentMethod } from '../../lib/securityOnboarding';
interface Approval {
 id:string;customer_name:string;description:string;terms:string;version:string;
 accepted_at:string|null;accepted_by:string|null;payment_method_id:string|null;payment_display:string;
 waived:boolean;closed:boolean;ready:boolean;
}
export default function ServiceApprovalPage() {
 const params = new URLSearchParams(window.location.search);
 const requestId=params.get('request') || ''; const token=params.get('token') || '';
 const [approval,setApproval]=useState<Approval|null>(null);const [error,setError]=useState('');
 const [name,setName]=useState('');const [agreed,setAgreed]=useState(false);const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const {data,error}=await supabase.rpc('portal_service_approval',{p_action:'get',p_id:requestId,p_token:token});
  if(error) throw new Error(error.message);setApproval(data as Approval);
 },[requestId,token]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 const request=useCallback(<T,>(action:'list'|'add'|'verify',payload?:Record<string,unknown>)=>servicePaymentRequest<T>(action,requestId,token,payload),[requestId,token]);
 async function accept() {
  if(!approval || !agreed || !name.trim()) return;
  setBusy(true);setError('');
  try {const {error}=await supabase.rpc('portal_service_approval',{p_action:'accept',p_id:requestId,p_token:token,p_version:approval.version,p_name:name});if(error) throw error;await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function select(method:SecurityPaymentMethod) {
  setBusy(true);setError('');
  try {await request('verify',{methodId:method.id});await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-gray-50 p-4 sm:p-8"><div className="max-w-2xl mx-auto bg-white border rounded-2xl p-5 sm:p-8 space-y-5">
  <h1 className="text-2xl font-bold text-gray-900">Prepare your service appointment</h1>
  {error && <p role="alert" className="bg-red-50 text-red-800 rounded-lg p-3">{error}</p>}
  {!approval ? <p>{error ? 'Contact your service provider for help with this request.' : 'Loading service request…'}</p> : <>
   <p className="text-gray-700">Hello {approval.customer_name}. Review your service request and rates below.</p>
   <p className="whitespace-pre-wrap text-gray-700">{approval.description}</p>
   <details className="border rounded-lg p-4"><summary className="font-semibold text-gray-900 cursor-pointer">View Service Terms &amp; Conditions</summary><p className="whitespace-pre-wrap text-gray-700 mt-3">{approval.terms}</p></details>
   <p className="bg-blue-50 text-blue-900 rounded-lg p-4">No payment is collected now. Completing these steps allows us to schedule your service appointment. An appointment time has not yet been reserved.</p>
   {approval.waived ? <p role="status" className="text-green-800">Your service provider has waived these requirements. No further action is needed.</p> : approval.closed ? <p role="status">This request no longer needs customer action. Contact your provider about your appointment.</p> : <>
    {approval.accepted_at ? <p className="text-green-800">Rates and terms accepted by {approval.accepted_by}.</p> : <div className="space-y-3">
     <label className="block text-gray-800">Your name<input maxLength={200} value={name} onChange={e=>setName(e.target.value)} className="block border rounded-lg p-3 w-full mt-1" /></label>
     <label className="flex gap-2 text-gray-800"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} />I have read and agree to the Service Terms &amp; Conditions.</label>
     <button disabled={busy || !agreed || !name.trim()} onClick={()=>void accept()} className="bg-blue-900 text-white px-4 py-3 rounded-lg disabled:opacity-50">Accept Rates &amp; Terms</button>
    </div>}
    {approval.ready ? <p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">Your request is ready to schedule. Our service team will coordinate your appointment.</p> : <fieldset disabled={busy} className="space-y-3 disabled:opacity-60"><h2 className="font-semibold text-gray-900">Payment method for your service visit</h2>
     {approval.payment_method_id && <p className="text-green-800">Payment method on file: {approval.payment_display}</p>}
     <SecurityPaymentEnrollment contractId={requestId} token={token} selectedId={approval.payment_method_id || ''} request={request} serviceBooking onSelect={method=>void select(method)} />
    </fieldset>}
   </>}
  </>}
 </div></main>;
}
