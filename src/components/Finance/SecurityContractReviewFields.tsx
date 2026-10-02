import { useEffect, useState, type ReactNode } from 'react';
import { Pencil, X, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SECURITY_INITIAL_TERMS, securityPaymentRequest } from '../../lib/securityOnboarding';
import SecurityPaymentEnrollment from '../Portal/SecurityPaymentEnrollment';
import { SignaturePad } from '../Production/SignaturePad';

type Field = { key: string; label: string; value: any; type?: string; options?: { value: string; label: string }[] };
const serviceKinds = ['dial_up','telguard','alarmnet','alarm_com','video_monitoring','access_control'];
const serviceLabels: Record<string,string> = {dial_up:'Monitoring / Dial-Up',telguard:'Telguard',alarmnet:'Alarmnet',alarm_com:'Alarm.com',video_monitoring:'Video / CCTV',access_control:'Access Control'};

export default function SecurityContractReviewFields({ contract, canEdit, canAdmin = false, onSaved, onEditing }: {
  contract: any; canEdit: boolean; canAdmin?: boolean; onSaved: () => Promise<void>; onEditing: (editing: boolean) => void;
}) {
  const [editing,setEditing] = useState<Field|null>(null);
  const [value,setValue] = useState<any>('');
  const [reason,setReason] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [autopayAccepted,setAutopayAccepted] = useState(false);
  const [newMethodId,setNewMethodId] = useState('');
  const [services,setServices] = useState<any[]>([]);
  const [taxClasses,setTaxClasses] = useState<any[]>([]);
  const [history,setHistory] = useState<any[]>([]);
  useEffect(() => { void (async () => {
    const [s,t,h] = await Promise.all([
      supabase.from('monitoring_services').select('id,name').eq('organization_id',contract.organization_id).eq('is_active',true).order('name'),
      supabase.from('tax_classifications').select('id,label').eq('organization_id',contract.organization_id).eq('is_active',true).order('label'),
      canEdit ? supabase.from('security_onboarding_corrections').select('revision,created_at,actor_id,reason,actor:profiles!actor_id(full_name,first_name,last_name)').eq('contract_id',contract.id).order('revision',{ascending:false}) : Promise.resolve({data:[]}),
    ]);
    setServices(s.data || []);setTaxClasses(t.data || []);setHistory(h.data || []);
  })(); },[contract.id,contract.organization_id,contract.onboarding_revision,canEdit]);
  const doc=contract.onboarding_agreement_snapshot || {};
  const personal=doc.personalInfo || contract.contact || {};
  const property=doc.propertyInfo || {address_line1:contract.property_address,city:contract.property_city,state:contract.property_state,zip_code:contract.property_zip};
  const emergency=(contract.emergency_contacts || []).map((c:any)=>({name:c.contact_name,phone:c.phone_number,password:c.password_codeword,canAuthorize:c.can_authorize_entry}));
  const groups: {name:string; fields:Field[]}[] = [
    {name:'Customer',fields:[
      {key:'personalInfo.full_name',label:'Full name',value:personal.full_name},
      {key:'personalInfo.email',label:'Email',value:personal.email,type:'email'},
      {key:'personalInfo.phone',label:'Phone',value:personal.phone,type:'tel'},
      {key:'email_override',label:'Invitation email override',value:contract.email_override,type:'email'},
    ]},
    {name:'Property',fields:[
      {key:'propertyInfo.address_line1',label:'Service address',value:property.address_line1},
      {key:'propertyInfo.city',label:'City',value:property.city},
      {key:'propertyInfo.state',label:'State',value:property.state},
      {key:'propertyInfo.zip_code',label:'ZIP code',value:property.zip_code},
    ]},
    {name:'Account setup',fields:[
      {key:'account_type',label:'Account type',value:contract.account_type,options:[{value:'residential',label:'Residential'},{value:'commercial',label:'Commercial'}]},
      {key:'account_services',label:'Account services',value:contract.account_services || [],type:'account_services'},
      {key:'is_monitoring',label:'Monitoring enabled',value:!!contract.is_monitoring,type:'boolean'},
      {key:'account_number',label:'Monitoring account number',value:contract.account_number},
      ...serviceKinds.map(s=>({key:`service_account_numbers.${s}`,label:`${serviceLabels[s]} account number`,value:contract.service_account_numbers?.[s]})),
      {key:'installation_date',label:'Installation date',value:contract.installation_date,type:'date'},
      {key:'monitoring_tax_classification_id',label:'Tax classification',value:contract.monitoring_tax_classification_id,options:taxClasses.map(t=>({value:t.id,label:t.label}))},
      {key:'notes',label:'Internal notes',value:contract.notes,type:'textarea'},
    ]},
    {name:'Agreement and billing',fields:[
      {key:'contract_number',label:'Contract number',value:contract.contract_number},
      {key:'monthly_price',label:'Monthly price (including mailing fee)',value:contract.monthly_price,type:'number'},
      {key:'term_months',label:'Initial term',value:contract.term_months,options:SECURITY_INITIAL_TERMS.map(n=>({value:String(n),label:`${n} months`}))},
      {key:'renewal_term_months',label:'Renewal term (months)',value:contract.renewal_term_months,type:'number'},
      {key:'cancellation_notice_days',label:'Cancellation notice (days)',value:contract.cancellation_notice_days,type:'number'},
      {key:'billingPreference',label:'Billing preference',value:doc.billingPreference || (contract.billing_frequency_override==='yearly'?'annual':'monthly'),options:[{value:'monthly',label:'Monthly'},...(doc.dealer?.annual_billing_enabled ? [{value:'annual',label:'Annual'}] : [])]},
      {key:'service_ids',label:'Monitoring services',value:(contract.services || []).map((s:any)=>s.service_id),type:'services'},
      {key:'contract_terms',label:'Agreement terms',value:doc.template?.contract_terms || contract.template?.contract_terms || '',type:'textarea'},
      {key:'security_billing_mode',label:'Billing method',value:contract.security_billing_mode,type:'billing_mode',options:[{value:'autopay',label:'Required AutoPay'},{value:'mail',label:'Admin-approved mailed invoices (+$7/month)'}]},
      {key:'paymentMethodId',label:'Payment method',value:doc.payment_display || 'No saved payment method',type:'payment'},
      {key:'customer_signature',label:'Customer signature',value:contract.customer_signature,type:'signature'},
      {key:'customer_signature_date',label:'Signing date',value:contract.customer_signature_date,type:'datetime-local'},
    ]},
    {name:'Emergency contacts',fields:[{key:'emergencyContacts',label:'Emergency contacts and codewords',value:emergency,type:'contacts'}]},
  ];
  function close() {setEditing(null);setReason('');setError('');setAutopayAccepted(false);onEditing(false);}
  function start(field:Field) {
    setEditing(field);setValue(field.type==='payment' ? contract.security_payment_method_id || '' : field.type==='datetime-local' && field.value ? new Date(new Date(field.value).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16) : structuredClone(field.value ?? ''));
    setError('');setReason('');setAutopayAccepted(false);setNewMethodId('');onEditing(true);
  }
  async function save() {
    if (!editing) return;
    setBusy(true);setError('');
    try {
      let v=value;
      if (editing.type==='number' || editing.key==='term_months') {v=Number(value);if(!Number.isFinite(v) || value==='')throw new Error('Enter a valid number.');}
      if (editing.type==='datetime-local') v=new Date(value).toISOString();
      if (editing.key==='monitoring_tax_classification_id' || editing.type==='date') v=value || null;
      let patch:Record<string,unknown>={};
      const [parent,child]=editing.key.split('.');
      patch[ parent ]=child ? {...(parent==='service_account_numbers' ? contract.service_account_numbers || {} : {}),[child]:v} : v;
      if (editing.type==='payment') {
        if(!autopayAccepted) throw new Error('Confirm the customer authorized recurring payments with this method.');
        await securityPaymentRequest('verify',contract.id,'',{methodId:value});patch.autopay_accepted=true;
      }
      if (editing.type==='billing_mode' && value==='autopay' && contract.security_billing_mode==='mail') {
        if(!newMethodId || !autopayAccepted)throw new Error('Select a payment method and confirm customer AutoPay authorization.');
        await securityPaymentRequest('verify',contract.id,'',{methodId:newMethodId});patch.paymentMethodId=newMethodId;patch.autopay_accepted=true;
      }
      const {error:rpcError}=await supabase.rpc('security_correct_onboarding',{p_id:contract.id,p_revision:contract.onboarding_revision || 0,p_patch:patch,p_reason:reason});
      if(rpcError)throw rpcError;
      close();await onSaved();
    } catch(e) {setError(e instanceof Error ? e.message : (e as any)?.message || 'Correction could not be saved.');}
    finally {setBusy(false);}
  }
  function display(field:Field):ReactNode {
    if(field.type==='signature')return field.value && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(field.value) ? <img src={field.value} alt="Customer signature" className="max-h-24 max-w-full"/> : 'Recorded on paper';
    if(field.type==='contacts')return field.value.map((c:any,i:number)=><div key={i}>{i+1}. {c.name} · {c.phone} · Codeword: •••• · {c.canAuthorize?'May authorize entry':'Cannot authorize entry'}</div>);
    if(field.type==='account_services')return field.value.map((s:string)=>serviceLabels[s] || s).join(', ') || 'Not entered';
    if(field.type==='services')return doc.services?.map((s:any)=>s.name).join(', ') || 'Not entered';
    if(field.type==='boolean')return field.value?'Yes':'No';
    if(field.options)return field.options.find(o=>o.value===String(field.value))?.label || 'Not entered';
    return field.value || 'Not entered';
  }
  return <section className="bg-white text-gray-900 border rounded-xl p-5 my-6 no-print">
    <h2 className="text-xl font-semibold">Review completed contract</h2>
    <p className="text-sm text-gray-600 mt-2">Fields are locked. Use the edit icon to correct a field before approval and activation. Original submission and correction history are retained.</p>
    {doc.staff_corrected_at && <p className="text-sm text-blue-800 mt-2">Staff corrections saved · revision {contract.onboarding_revision}. Awaiting approval.</p>}
    {groups.map(group=><div key={group.name} className="mt-6"><h3 className="font-semibold border-b pb-2">{group.name}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">{group.fields.map(field=><div key={field.key} className={['textarea','contacts'].includes(field.type || '')?'md:col-span-2':''}>
      <div className="flex justify-between gap-2 items-center"><span className="text-sm font-medium text-gray-700">{field.label}</span>{canEdit && (field.type!=='billing_mode' || canAdmin) && <button type="button" aria-label={`Edit ${field.label}`} onClick={()=>start(field)} className="p-2 text-blue-700 rounded hover:bg-blue-50"><Pencil className="w-4 h-4"/></button>}</div>
      <div className="p-3 border rounded bg-gray-50 whitespace-pre-wrap break-words max-h-64 overflow-auto">{display(field)}</div>
    </div>)}</div></div>)}
    {history.length>0 && <details className="mt-6"><summary className="cursor-pointer font-medium">Correction history</summary>{history.map(h=><p key={h.revision} className="text-sm mt-2">Revision {h.revision} · {new Date(h.created_at).toLocaleString()} · {h.reason} · Recorded by {h.actor?.full_name || [h.actor?.first_name,h.actor?.last_name].filter(Boolean).join(' ') || 'Authorized staff'}</p>)}</details>}
    {editing && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label={`Edit ${editing.label}`} className="bg-white text-gray-900 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
      <h3 className="text-lg font-semibold mb-4">Edit {editing.label}</h3>
      {editing.type==='contacts' ? <div className="space-y-4">{value.map((c:any,i:number)=><fieldset key={i} className="border rounded p-3 space-y-2"><legend>Emergency contact {i+1}</legend>{(['name','phone','password'] as const).map(k=><label key={k} className="block text-sm">{k==='password'?'Codeword':k==='name'?'Name':'Phone'}<input aria-label={`Contact ${i+1} ${k}`} value={c[k] || ''} onChange={e=>setValue(value.map((v:any,n:number)=>n===i?{...v,[k]:e.target.value}:v))} className="block border rounded p-2 w-full"/></label>)}<label className="flex gap-2"><input type="checkbox" checked={!!c.canAuthorize} onChange={e=>setValue(value.map((v:any,n:number)=>n===i?{...v,canAuthorize:e.target.checked}:v))}/>Can authorize entry</label><button type="button" disabled={value.length<=2} onClick={()=>setValue(value.filter((_:any,n:number)=>n!==i))} className="p-2 text-red-700" aria-label={`Remove contact ${i+1}`}><Trash2 className="w-4 h-4"/></button></fieldset>)}<button type="button" disabled={value.length>=10} onClick={()=>setValue([...value,{name:'',phone:'',password:'',canAuthorize:false}])} className="flex items-center gap-2 border rounded p-2"><Plus className="w-4 h-4"/>Add contact</button></div>
      : editing.type==='payment' ? <><SecurityPaymentEnrollment contractId={contract.id} token="" selectedId={value} onSelect={m=>{setValue(m.id);setAutopayAccepted(false);}}/><label className="flex gap-2 mt-4"><input type="checkbox" checked={autopayAccepted} onChange={e=>setAutopayAccepted(e.target.checked)}/>Customer authorized recurring AutoPay with this method.</label></>
      : editing.type==='signature' ? <><p className="text-sm mb-3">Ask the customer to sign here. The earlier signature remains in the original submission.</p><SignaturePad onSave={setValue}/></>
      : ['account_services','services'].includes(editing.type || '') ? <div className="space-y-2">{(editing.type==='services'?services.map(s=>({value:s.id,label:s.name})):serviceKinds.map(s=>({value:s,label:serviceLabels[s]}))).map(o=><label key={o.value} className="flex gap-2"><input type="checkbox" checked={value.includes(o.value)} onChange={e=>setValue(e.target.checked?[...value,o.value]:value.filter((v:string)=>v!==o.value))}/>{o.label}</label>)}</div>
      : editing.type==='boolean' ? <label className="flex gap-2"><input type="checkbox" checked={!!value} onChange={e=>setValue(e.target.checked)}/>{editing.label}</label>
      : editing.type==='billing_mode' ? <><select aria-label={editing.label} value={value} onChange={e=>setValue(e.target.value)} className="border rounded p-3 w-full">{editing.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>{value==='autopay' && contract.security_billing_mode==='mail' && <div className="mt-4"><SecurityPaymentEnrollment contractId={contract.id} token="" selectedId={newMethodId} onSelect={m=>{setNewMethodId(m.id);setAutopayAccepted(false);}}/><label className="flex gap-2 mt-4"><input type="checkbox" checked={autopayAccepted} onChange={e=>setAutopayAccepted(e.target.checked)}/>Customer authorized recurring AutoPay with this method.</label></div>}<p className="text-sm mt-3">The $7 monthly mailing fee is added or removed when this change is saved.</p></>
      : editing.options ? <select aria-label={editing.label} value={value} onChange={e=>setValue(e.target.value)} className="border rounded p-3 w-full"><option value="">Select…</option>{editing.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : editing.type==='textarea' ? <textarea aria-label={editing.label} value={value} onChange={e=>setValue(e.target.value)} rows={10} className="border rounded p-3 w-full"/>
      : <input aria-label={editing.label} type={editing.type || 'text'} value={value} onChange={e=>setValue(e.target.value)} step={editing.type==='number'?'any':undefined} className="border rounded p-3 w-full"/>}
      <label className="block mt-4 text-sm font-medium">Reason for correction<input aria-label="Reason for correction" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Customer called to correct their phone number" className="block border rounded p-3 mt-1 w-full"/></label>
      {error && <p role="alert" className="text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-5"><button type="button" disabled={busy} onClick={close} className="flex items-center gap-2 border rounded p-3"><X className="w-4 h-4"/>Cancel</button><button type="button" disabled={busy || reason.trim().length<3} onClick={()=>void save()} className="flex items-center gap-2 bg-blue-700 text-white rounded p-3"><Save className="w-4 h-4"/>{busy?'Saving…':'Save correction'}</button></div>
    </div></div>}
  </section>;
}
