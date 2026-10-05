import { staffSecurityOnboarding } from '../../lib/securityOnboarding';
import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import {PaymentAlertsPanel} from './PaymentAlertsPanel';
import {ActiveAutopayMethodEditor} from './ActiveAutopayMethodEditor';

interface Cycle { id:string; state:string; amount:number|null; period_start:string; last_message:string|null; processor_id:string|null;updated_at:string }
export function SecurityBillingPanel({ contractId, organizationId, canEdit = false }: { contractId:string; organizationId:string; canEdit?:boolean }) {
  const { profile } = useAuth();
  const [editingClassification,setEditingClassification] = useState(false);
  const [classes,setClasses] = useState<{id:string;label:string}[]>([]);
  const [classification,setClassification] = useState('');
  const [cycles,setCycles] = useState<Cycle[]>([]);
  const [reason,setReason] = useState('');
  const [transaction,setTransaction] = useState('');
  const [message,setMessage] = useState('');
  const [paused,setPaused] = useState(false);
  const [revoked,setRevoked] = useState(false);
  const [dates,setDates] = useState<{monitoring_start_date?:string;first_payment_date?:string}>({});
  const [firstPaid,setFirstPaid] = useState<string|null>(null);
  const reload = useCallback(async () => {
    const [tax,billing,contract,review] = await Promise.all([
      supabase.from('tax_classifications').select('id,label').eq('organization_id',organizationId).eq('is_active',true),
      supabase.from('security_billing_cycles').select('id,state,amount,period_start,last_message,processor_id,updated_at').eq('contract_id',contractId).eq('organization_id',organizationId).order('period_index',{ascending:false}),
      supabase.from('security_contracts').select('monitoring_tax_classification_id,autopay_paused,autopay_revoked_at,monitoring_start_date,first_payment_date').eq('id',contractId).eq('organization_id',organizationId).single(),
      staffSecurityOnboarding<{summary:{first_payment_made_at:string|null}}>('get',contractId).catch(()=>null),
    ]);
    const error=tax.error||billing.error||contract.error;
    if(error) {setMessage(error.message);return;}
    setClasses(tax.data||[]);setCycles(billing.data||[]);setClassification(contract.data?.monitoring_tax_classification_id||'');
    setDates(contract.data||{});setFirstPaid(review?.summary?.first_payment_made_at||null);
    setPaused(Boolean(contract.data?.autopay_paused));setRevoked(Boolean(contract.data?.autopay_revoked_at));
  },[contractId,organizationId]);
  useEffect(()=>{void reload();},[reload]);
  async function review(cycle:Cycle,action:string) {
    const {error}=await supabase.rpc('security_billing_review',{p_id:cycle.id,p_action:action,p_reason:reason,p_processor_id:transaction.trim()||null});
    setMessage(error ? error.message : 'Review recorded. Billing will resume through the checked workflow.');
    if(!error) {setReason('');setTransaction('');await reload();}
  }
  return <section className="no-print bg-white text-gray-900 rounded-xl p-5 mb-6 space-y-4">
    <h2 className="font-semibold text-lg">Monitoring billing</h2>
    <PaymentAlertsPanel contractId={contractId}/>
    <ActiveAutopayMethodEditor contractId={contractId} organizationId={organizationId} onUpdated={()=>void reload()}/>
    <p>Monitoring starts: {dates.monitoring_start_date || 'Not scheduled'}. First payment scheduled: {dates.first_payment_date || 'Not scheduled'}. First payment confirmed: {firstPaid ? new Date(firstPaid).toLocaleDateString() : 'Not yet confirmed'}.</p>
    <label className="block">Tax classification (required before activation)
      {canEdit && <button type="button" aria-label="Edit tax classification" onClick={()=>setEditingClassification(true)} className="p-2 text-blue-700"><Pencil className="w-4 h-4"/></button>}
      <select disabled={!editingClassification} value={classification} onChange={e=>setClassification(e.target.value)} className="block w-full border rounded p-2 mt-1"><option value="">Select classification</option>{classes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {editingClassification && <><button className="bg-blue-700 text-white px-3 py-2 rounded" onClick={async()=>{
      const {error}=await supabase.from('security_contracts').update({monitoring_tax_classification_id:classification||null}).eq('id',contractId).eq('organization_id',organizationId);
      setMessage(error ? error.message : 'Tax classification saved.');if(!error)setEditingClassification(false);
    }}>Save classification</button><button className="border rounded px-3 py-2 ml-2" onClick={()=>{setEditingClassification(false);void reload();}}>Cancel</button></>}
    {profile?.role==='admin' && <button className="border rounded px-3 py-2 ml-2" disabled={revoked} onClick={async()=>{
      const {error}=await supabase.from('security_contracts').update({autopay_paused:!paused}).eq('id',contractId).eq('organization_id',organizationId);
      setMessage(error ? error.message : 'AutoPay status saved.');if(!error) await reload();
    }}>{revoked ? 'New authorization required after revocation' : paused ? 'Resume authorized AutoPay' : 'Pause AutoPay'}</button>}
    {cycles.length===0 && <p className="text-sm text-gray-600">Staff sets the dates after the completed agreement is approved. Billing starts on that schedule; customer submission alone does not activate monitoring.</p>}
    {cycles.map(cycle=><div key={cycle.id} className="border rounded-lg p-3 space-y-2">
      <p>{cycle.period_start} · {cycle.amount===null ? 'Awaiting tax calculation' : formatCurrency(Number(cycle.amount))} · {cycle.state}</p>
      {cycle.last_message && <p className="text-sm text-amber-900">{cycle.last_message}</p>}
      {cycle.processor_id && <p className="text-xs break-all">Processor transaction: {cycle.processor_id}</p>}
      {profile?.role==='admin' && ['declined','unknown','review'].includes(cycle.state) && <div className="space-y-2">
        <input aria-label="Billing review reason" placeholder="Document reconciliation evidence (at least 10 characters)" value={reason} onChange={e=>setReason(e.target.value)} className="border rounded p-2 w-full" />
        <input aria-label="Provider transaction ID" placeholder="Verified QuickBooks transaction ID for lookup" value={transaction} onChange={e=>setTransaction(e.target.value)} className="border rounded p-2 w-full" />
        <button className="border rounded p-2" onClick={()=>void review(cycle,'reconcile')}>Look up provider transaction</button>
        <button className="border rounded p-2 ml-2" onClick={()=>void review(cycle,'retry_confirmed_no_charge')}>Confirm no charge and schedule new notice</button>
        <p className="text-xs text-gray-600">Reconcile the merchant account first. An uncertain payment is never automatically charged again. A retry sends a new advance notice.</p>
      </div>}
    </div>)}
    {message && <p role="status">{message}</p>}
  </section>;
}
