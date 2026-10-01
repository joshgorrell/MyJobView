import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FlowScope, FlowTarget, targetScope } from '../../lib/flow/types';
import { FlowTargetPicker } from './FlowTargetPicker';
import { insertFlowTag, useFlowTags, TagChoice } from './useFlowTags';

export function PostFlowUpdate({ scope, onClose, onPosted, compact = false }: { scope: FlowScope; onClose: () => void; onPosted: () => void; compact?: boolean }) {
  const { profile } = useAuth();
  const [target, setTarget] = useState<FlowTarget | null>(null);
  const [selectedToken, setSelectedToken] = useState('');
  const [body, setBody] = useState('');
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { tag, choices } = useFlowTags(body, cursor, profile?.organization_id);
  const [type, setType] = useState('update');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const context = target ? targetScope(target) : scope;
  const hasContext = !!(context.contactId || context.projectId || context.workOrderId);
  function choose(choice: TagChoice) {
    if (!tag) return;
    const inserted = insertFlowTag(body, cursor, tag.start, choice);
    setBody(inserted.text); setCursor(inserted.cursor); setDismissed(false); setHighlight(0);
    if (choice.kind !== 'person') { setTarget(choice); setSelectedToken(inserted.text.slice(tag.start, inserted.cursor).trim()); }
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(inserted.cursor, inserted.cursor); });
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!tag || dismissed) return;
    if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => (i + (e.key === 'ArrowDown' ? 1 : choices.length - 1)) % Math.max(choices.length, 1)); return; }
    if ((e.key === 'Enter' || e.key === 'Tab') && choices.length) { e.preventDefault(); choose(choices[Math.min(highlight, choices.length - 1)]); }
  }
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
    {compact && <textarea ref={textarea} onSelect={e => setCursor(e.currentTarget.selectionStart)} onKeyDown={handleKeyDown} aria-label="Update" placeholder="What happened? For example: I saw Steve Brown today and he asked about the Event Center schedule." value={body} maxLength={4000} rows={3} onChange={e => { setBody(e.target.value); setCursor(e.target.selectionStart); if (selectedToken && !e.target.value.includes(selectedToken)) { setTarget(null); setSelectedToken(''); } setHighlight(0); setDismissed(false); }} />}
    {tag && !dismissed && <div className="flow-tag-results" role="listbox" aria-label={tag.symbol === '@' ? 'People' : 'Customers and jobs'}>{choices.length ? choices.map((choice, index) => <button type="button" role="option" aria-selected={index === Math.min(highlight, choices.length - 1)} key={`${choice.kind}:${choice.id}`} onClick={() => choose(choice)}>{choice.kind === 'person' ? `@${choice.username} · ${choice.label}` : `# ${choice.label} · ${choice.kind.replace('_', ' ')}`}</button>) : <span>No matching {tag.symbol === '@' ? 'people' : 'records'}</span>}</div>}
    {!hasContext && <div className="flow-quick-target"><strong>Link to a customer or job</strong><FlowTargetPicker onSelect={choice => { setTarget(choice); setSelectedToken(''); }} /></div>}
    {target && <p className="flow-target-label">Posting to: {target.label} <button type="button" onClick={() => { setTarget(null); setSelectedToken(''); }}>Change</button></p>}
    <label>Type <select value={type} onChange={e => setType(e.target.value)}>
      <option value="update">General update</option><option value="working_issue">Working issue</option><option value="customer_contact">Customer contact</option>
      <option value="material_issue">Material issue</option><option value="scheduling_issue">Scheduling issue</option><option value="resolved">Issue resolved</option>
    </select></label>
    {!compact && <textarea ref={textarea} onSelect={e => setCursor(e.currentTarget.selectionStart)} onKeyDown={handleKeyDown} aria-label="Update" placeholder="What does the team need to know?" value={body} maxLength={4000} rows={3} onChange={e => { setBody(e.target.value); setCursor(e.target.selectionStart); if (selectedToken && !e.target.value.includes(selectedToken)) { setTarget(null); setSelectedToken(''); } setHighlight(0); setDismissed(false); }} />}
    <div className="flow-composer-footer"><span>Type # to find a customer or job; @ to mention a teammate. Visible to employees with access to this record.</span><button className="flow-primary" disabled={saving || !hasContext || !body.trim()}>{saving ? 'Posting…' : 'Post update'}</button></div>
    {error && <p role="alert" className="flow-error">{error}</p>}
  </form>;
}
