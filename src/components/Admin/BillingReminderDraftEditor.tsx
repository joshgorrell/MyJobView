import { composeBillingDraftPreview } from '../../lib/billingDraftPreview';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BILLING_TEMPLATE_DEFAULTS, validateBillingTemplates, renderBillingTemplatePreview, type BillingTemplate } from '../../lib/billingReminderTemplates';

export function BillingReminderDraftEditor({ organizationId }: { organizationId: string }) {
  const [templates,setTemplates]=useState<BillingTemplate[]>([]);
  const [days,setDays]=useState(7);
  const [accountPreview,setAccountPreview]=useState<ReturnType<typeof composeBillingDraftPreview>|null>(null);
  const [previewBusy,setPreviewBusy]=useState(false);
  async function previewAccounts(){
    setAccountPreview(null);setError('');setPreviewBusy(true);
    try{
      validateBillingTemplates(templates);
      const {data,error}=await supabase.from('invoices').select('id,organization_id,contact_id,due_date,status,amount_due,portal_visible,security_billing_cycle_id').eq('organization_id',organizationId).eq('portal_visible',true).in('status',['submitted','sent','partial','overdue']).gt('amount_due',0).is('security_billing_cycle_id',null).order('id').limit(101);
      if(error)throw error;
      if((data??[]).length>100)throw new Error('More than 100 invoices match. A paginated preview is required before displaying account totals.');
      const now=new Date();
      const asOf=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
      setAccountPreview(composeBillingDraftPreview({organizationId,minimumDays:days,templates},(data??[]).filter(i=>i.contact_id).map(i=>({id:i.id,organizationId:i.organization_id,contactId:i.contact_id,dueDate:i.due_date,balanceCents:Math.round(Number(i.amount_due)*100),eligible:true,lastReminderOffset:null})),[],asOf));
    }catch(e){setError(e instanceof Error?e.message:'Unable to preview accounts.');}
    finally{setPreviewBusy(false);}
  }
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [preview,setPreview]=useState<{subject:string;body:string}|null>(null);
  useEffect(()=>{
    let active=true;
    setLoading(true); setLoaded(false); setError('');
    void (async()=>{
      try {
        const {data,error}=await supabase.from('billing_reminder_drafts').select('minimum_days,templates').eq('organization_id',organizationId).maybeSingle();
        if(error) throw error;
        const next=data ? data.templates as BillingTemplate[] : BILLING_TEMPLATE_DEFAULTS.map(t=>({...t}));
        validateBillingTemplates(next);
        if(active){setTemplates(next);setDays(data?.minimum_days ?? 7);setLoaded(true);}
      } catch {if(active)setError('Unable to load billing reminder drafts.');}
      finally {if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[organizationId]);
  const edit=(index:number,patch:Partial<BillingTemplate>)=>{setTemplates(old=>old.map((t,i)=>i===index?{...t,...patch}:t));setPreview(null);setMessage('');};
  async function save(){
    if(!loaded || saving)return;
    setError('');setMessage('');
    try{
      validateBillingTemplates(templates);
      if(!Number.isInteger(days)||days<1||days>365)throw new Error('Enter a minimum interval between 1 and 365 days.');
      setSaving(true);
      const {error}=await supabase.from('billing_reminder_drafts').upsert({organization_id:organizationId,minimum_days:days,templates,updated_at:new Date().toISOString()},{onConflict:'organization_id'});
      if(error)throw new Error('Could not save billing reminder drafts.');
      setMessage('Draft saved. No emails will be sent.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save draft.');}
    finally{setSaving(false);}
  }
  return <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
    <h3 className="text-lg font-semibold text-gray-900">Billing reminder timeline</h3>
    <p className="text-sm text-gray-600">Draft only — no automatic emails are active. Negative days are before the invoice due date.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {loading&&<p>Loading reminder settings…</p>}
    {loaded&&<fieldset disabled={saving||previewBusy} className="space-y-4">
      <label className="block text-sm font-medium">Minimum days between account reminders<input type="number" min={1} max={365} value={days} onChange={e=>{setDays(Number(e.target.value));setMessage('');}} className="block border rounded p-2 w-28"/></label>
      <p className="text-sm text-gray-600">Variables: {'{{customer_name}}'} and {'{{reminder_balance}}'}</p>
      {templates.map((t,i)=><div key={i} className="border rounded-lg p-3 space-y-2">
        <label className="block text-sm">Days relative to due date<input type="number" min={-365} max={365} value={t.offset} onChange={e=>edit(i,{offset:Number(e.target.value)})} className="block border rounded p-2 w-28"/></label>
        <label className="block text-sm">Subject<input value={t.subject} maxLength={160} onChange={e=>edit(i,{subject:e.target.value})} className="block border rounded p-2 w-full"/></label>
        <label className="block text-sm">Message<textarea value={t.body} maxLength={10000} onChange={e=>edit(i,{body:e.target.value})} className="block border rounded p-2 w-full" rows={4}/></label>
        <button type="button" className="text-blue-700 mr-4" onClick={()=>{try{setPreview(renderBillingTemplatePreview(t,'Sample Customer',250000));setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid template');setPreview(null);}}}>Preview example</button>
        <button type="button" className="text-red-700" onClick={()=>{setTemplates(old=>old.filter((_,j)=>j!==i));setPreview(null);setMessage('');}}>Remove stage</button>
      </div>)}
      <button type="button" disabled={templates.length>=32} className="text-blue-700" onClick={()=>{setTemplates(old=>[...old,{offset:Math.min(365,(old[old.length - 1]?.offset??-1)+7),subject:'Payment reminder',body:'Hello {{customer_name}}, please review your outstanding invoices.'}]);setMessage('');}}>Add stage</button>
      {preview&&<div className="bg-gray-50 rounded p-3"><strong>{preview.subject}</strong><p className="whitespace-pre-wrap">{preview.body}</p></div>}
      <button type="button" onClick={()=>void save()} className="block bg-blue-600 text-white rounded px-4 py-2">{saving?'Saving…':'Save reminder draft'}</button>
      <button type="button" onClick={()=>void previewAccounts()} className="block border rounded px-4 py-2">{previewBusy?'Loading preview…':'Preview invoice candidates'}</button>
      {accountPreview&&<div className="rounded border p-3 space-y-2">
        <p className="font-medium">Illustrative candidates: {accountPreview.length} accounts</p>
        <p className="text-sm text-gray-600">All candidates are held. Payment settlement, disputes, prior reminders and dealer timezone are not yet verified. Results are not payable statements or a delivery queue. Run again after editing settings.</p>
        {accountPreview.map(a=><div key={a.contactId} className="border-t py-2 text-sm">{a.invoices.length} invoice(s) · {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(a.balanceCents/100)} · Stage {a.stage} · History unavailable</div>)}
      </div>}
      {message&&<p role="status" className="text-green-700">{message}</p>}
    </fieldset>}
  </section>;
}
