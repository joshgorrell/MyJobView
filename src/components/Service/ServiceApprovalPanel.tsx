import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendServiceApproval, serviceApprovalPending, type ServiceApprovalFields } from '../../lib/serviceApproval';

export function ServiceApprovalPanel({request,onChanged}: {request: ServiceApprovalFields & {id:string;status:string};onChanged:()=>void}) {
  const {profile} = useAuth();
  const [reason,setReason] = useState('');
  const [showOverride,setShowOverride] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  if (!request.service_approval_required) return null;
  const pending = serviceApprovalPending(request);
  const editable = !['scheduled','closed','cancelled','in_progress'].includes(request.status);
  const canOverride = profile?.role === 'admin' || String(profile?.role) === 'service_manager';
  async function run(override: boolean) {
    setBusy(true);setMessage('');
    try {
      if (override) {
        const {error} = await supabase.rpc('staff_service_approval',{p_action:'waive',p_id:request.id,p_reason:reason});
        if (error) throw error;
        setShowOverride(false);onChanged();
      } else { await sendServiceApproval(request.id);setMessage('Customer request email sent.'); }
    } catch(e) { setMessage(e instanceof Error ? e.message : (e as {message?:string})?.message || 'Unable to update request'); }
    finally {setBusy(false);}
  }
  return <section className="rounded-lg border border-amber-300 bg-surface p-4 space-y-3" aria-label="Customer approval requirements">
    <h4 className="font-semibold text-primary">{request.service_waived_at ? 'Customer requirements waived' : pending ? 'Pending – Waiting on Customer' : 'Ready to Schedule'}</h4>
    {request.service_waived_at ? <p className="text-sm text-secondary">Waived by {request.service_waived_by_profile?.full_name || 'Service Manager / Admin'} on {new Date(request.service_waived_at).toLocaleString()}. {request.service_waiver_reason}</p> : <ul className="text-sm text-secondary list-disc pl-5">
      <li>Rates and terms: {request.service_accepted_at ? `Accepted by ${request.service_accepted_by} on ${new Date(request.service_accepted_at).toLocaleString()}` : 'Waiting for acceptance'}</li>
      <li>Payment method: {request.service_payment_method_id ? 'On file' : 'Waiting for payment information'}</li>
    </ul>}
    <details><summary className="cursor-pointer text-sm text-primary">Preview customer service terms</summary><p className="whitespace-pre-wrap text-sm text-secondary mt-2">{request.service_terms}</p><p className="text-sm text-secondary mt-2">No payment is collected now. Completing these steps allows us to schedule your service appointment.</p></details>
    {editable && !request.service_waived_at && <div className="flex flex-wrap gap-3">
      {pending && <button type="button" disabled={busy} onClick={()=>void run(false)} className="border rounded-lg px-3 py-2 text-sm text-primary disabled:opacity-50">Send / Resend Customer Request</button>}
      {canOverride && <button type="button" disabled={busy} onClick={()=>setShowOverride(v=>!v)} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50">Override &amp; Allow Scheduling</button>}
    </div>}
    {showOverride && <div className="space-y-2">
      <label className="block text-sm text-primary">Override reason<textarea aria-label="Override reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="block w-full rounded border p-2 bg-canvas" placeholder="Existing customer—approved to proceed" /></label>
      <button type="button" disabled={busy || !reason.trim()} onClick={()=>void run(true)} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Confirm Override'}</button>
    </div>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
  </section>;
}
