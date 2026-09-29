import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FlowScope, FlowTarget, targetScope } from '../../lib/flow/types';
import { FlowTargetPicker } from './FlowTargetPicker';

export function PostFlowUpdate({ scope, onClose, onPosted, compact = false }: { scope: FlowScope; onClose: () => void; onPosted: () => void; compact?: boolean }) {
  const { profile } = useAuth();
  const [target, setTarget] = useState<FlowTarget | null>(null);
  const [body, setBody] = useState('');
  const [type, setType] = useState('update');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const context = target ? targetScope(target) : scope;
  const hasContext = !!(context.contactId || context.projectId || context.workOrderId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.organization_id || !hasContext || !body.trim() || saving) return;
    setSaving(true); setError('');
    const { error: failure } = await supabase.from('flow_updates').insert({
      organization_id: profile.organization_id, contact_id: context.contactId || null,
      project_id: context.projectId || null, work_order_id: context.workOrderId || null,
      author_id: profile.id, update_type: type, body: body.trim(),
    });
    setSaving(false);
    if (failure) { setError('Could not post this update. Check your access and try again.'); return; }
    onPosted();
  }
  return <form className="flow-composer" onSubmit={submit}>
    {!compact && <div className="flow-composer-heading"><strong>Post an update</strong><button type="button" onClick={onClose} aria-label="Close update"><X size={16} /></button></div>}
    {compact && <textarea aria-label="Update" placeholder="What happened? For example: I saw Steve Brown today and he asked about the Event Center schedule." value={body} maxLength={4000} rows={3} onChange={e => setBody(e.target.value)} autoFocus />}
    {!hasContext && <div className="flow-quick-target"><strong>Link to a customer or job</strong><FlowTargetPicker onSelect={setTarget} /></div>}
    {target && <p className="flow-target-label">{target.label} <button type="button" onClick={() => setTarget(null)}>Change</button></p>}
    <label>Type <select value={type} onChange={e => setType(e.target.value)}>
      <option value="update">General update</option><option value="working_issue">Working issue</option><option value="customer_contact">Customer contact</option>
      <option value="material_issue">Material issue</option><option value="scheduling_issue">Scheduling issue</option><option value="resolved">Issue resolved</option>
    </select></label>
    {!compact && <textarea aria-label="Update" placeholder="What does the team need to know?" value={body} maxLength={4000} rows={3} onChange={e => setBody(e.target.value)} />}
    <div className="flow-composer-footer"><span>Visible to employees with access to this record.</span><button className="flow-primary" disabled={saving || !hasContext || !body.trim()}>{saving ? 'Posting…' : 'Post update'}</button></div>
    {error && <p role="alert" className="flow-error">{error}</p>}
  </form>;
}
