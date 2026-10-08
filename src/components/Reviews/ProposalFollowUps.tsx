import { useEffect, useState } from 'react';
import { Mail, Eye, Send, CheckCircle, RotateCcw, Pencil, X, Maximize2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ProposalCheckHistory from './ProposalCheckHistory';
import { lostReviewAction } from './lostReview';

type Preview = { html: string; content: string; subject: string; recipient: string; reply_to: string; sender: string };

export default function ProposalFollowUps() {
  const { profile } = useAuth();
  const isJosh = profile?.email?.trim().toLowerCase() === 'josh@electroniclife.com';
  const [proposals, setProposals] = useState<{ id: string; title: string; proposal_number: string; contacts: { contact_name: string } | null }[]>([]);
  const [mode, setMode] = useState<'customer' | 'manual' | 'proposal'>('customer');
  const [contacts, setContacts] = useState<{ id: string; contact_name: string; email: string }[]>([]);
  const [contact, setContact] = useState('');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [proposal, setProposal] = useState('');
  const [variant, setVariant] = useState<'sales' | 'owner'>('sales');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [sendKey, setSendKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    if (!profile?.organization_id) return;
    setLoading(true);
    Promise.all([
      supabase.from('proposals').select('id,title,proposal_number,contacts:contact_id(contact_name)')
        .eq('organization_id', profile.organization_id).in('status', ['sent', 'viewed']).not('sent_at', 'is', null).order('sent_at', { ascending: false }),
      supabase.from('contacts').select('id,contact_name,email').eq('organization_id', profile.organization_id).order('contact_name'),
    ]).then(([proposalResult, contactResult]) => {
      if (!active) return;
      if (proposalResult.error || contactResult.error) setError(proposalResult.error?.message || contactResult.error?.message || 'Unable to load customers.');
      setProposals((proposalResult.data || []) as unknown as typeof proposals);
      setContacts(contactResult.data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setPreview(null); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [preview, busy]);

  const reset = () => { setPreview(null); setSent(false); setError(''); setSendKey(''); setEditedSubject(''); setEditedContent(''); setIsEditing(false); setPreviewExpanded(false); };

  async function act(send: boolean) {
    setBusy(true); setError('');
    try {
      const data = await lostReviewAction({
        action: send ? 'proposal_send' : 'proposal_preview',
        recipient_mode: mode,
        proposal_id: mode === 'proposal' ? proposal : undefined,
        contact_id: mode === 'customer' ? contact : undefined,
        recipient_name: mode === 'manual' ? name : undefined,
        recipient_email: mode === 'manual' ? email : undefined,
        variant,
        send_key: send ? sendKey : undefined,
        edited_subject: send ? editedSubject : undefined,
        edited_content: send ? editedContent : undefined,
      });
      if (send) { setSent(true); setPreview(null); }
      else {
        const p = data as Preview;
        setPreview(p);
        setEditedSubject(p.subject);
        setEditedContent(p.content);
        setSendKey(crypto.randomUUID());
        setIsEditing(false);
        setPreviewExpanded(false);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to prepare email.'); }
    finally { setBusy(false); if (send) setHistoryRefresh(v => v + 1); }
  }

  const canSubmit = (mode === 'proposal' ? proposal : mode === 'customer' ? contact : !!(name.trim() && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email.trim())));
  const isDirty = preview && (editedSubject !== preview.subject || editedContent !== preview.content);
  const livePreviewHtml = preview ? preview.html.replace(preview.content, editedContent) : '';

  return <div className="space-y-6 rounded-xl border border-cyan-800/50 bg-gray-800 p-4 sm:p-6">
    <div className="flex items-start gap-3"><Mail className="mt-1 h-6 w-6 text-cyan-400" /><div><h2 className="text-xl font-bold text-white">A thoughtful follow-up. A better experience.</h2><p className="mt-1 text-sm text-gray-400">Thank customers for the opportunity and ask what would help earn their business.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(['sales', ...(isJosh ? ['owner'] : [])] as ('sales' | 'owner')[]).map(v => <button key={v} disabled={busy} onClick={() => { setVariant(v); reset(); }} className={`rounded-xl border p-4 text-left transition ${variant === v ? 'border-cyan-400 bg-cyan-950/40' : 'border-gray-600 hover:border-gray-400'}`} aria-pressed={variant === v}><div className="font-semibold text-white">{v === 'owner' ? 'Owner Proposal Follow-Up' : 'Proposal Follow-Up'}</div><p className="mt-1 text-sm text-gray-400">{v === 'owner' ? 'A personal note from Josh Gorrell. Replies go directly to Josh.' : 'A warm check-in from you, or the linked proposal&apos;s salesperson. Replies go directly to the sender.'}</p></button>)}
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose recipient method">{([['customer', 'Select Customer'], ['manual', 'Enter Name & Email'], ['proposal', 'Link a Proposal']] as const).map(([value, label]) => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); reset(); }} className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${mode === value ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200' : 'border-gray-600 text-gray-300'}`}>{label}</button>)}</div>
    {mode === 'customer' && <div className="space-y-3"><label className="block text-sm font-medium text-gray-300">Search customers<input disabled={busy} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><label className="block text-sm font-medium text-gray-300">Customer<select disabled={busy || loading} value={contact} onChange={e => { setContact(e.target.value); reset(); }} className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"><option value="">{loading ? 'Loading customers…' : 'Choose a customer…'}</option>{contacts.filter(c => c.id === contact || `${c.contact_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())).map(c => <option key={c.id} value={c.id} disabled={!c.email}>{c.contact_name} · {c.email || 'No email address'}</option>)}</select></label><p className="text-xs text-gray-400">No proposal link is required. The salesperson version comes from you.</p></div>}
    {mode === 'manual' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-300">Customer name<input disabled={busy} maxLength={200} value={name} onChange={e => { setName(e.target.value); reset(); }} autoComplete="name" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><label className="block text-sm font-medium text-gray-300">Email address<input type="email" disabled={busy} maxLength={254} value={email} onChange={e => { setEmail(e.target.value); reset(); }} autoComplete="email" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><p className="text-xs text-gray-400 sm:col-span-2">Send without creating a customer record or linking a proposal.</p></div>}
    {mode === 'proposal' && <label className="block text-sm font-medium text-gray-300">Open proposal<select disabled={busy || loading} value={proposal} onChange={e => { setProposal(e.target.value); reset(); }} className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"><option value="">{loading ? 'Loading proposals…' : 'Choose a sent proposal…'}</option>{proposals.map(p => <option key={p.id} value={p.id}>{p.contacts?.contact_name || 'Customer'} · {p.proposal_number} · {p.title}</option>)}</select></label>}
    {error && <p role="alert" className="rounded-lg bg-red-950/50 p-3 text-red-300">{error}</p>}
    {sent && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-950/50 p-3 text-emerald-300"><CheckCircle className="h-5 w-5" />Proposal follow-up sent successfully.</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={!canSubmit || busy || sent} onClick={() => void act(false)} className="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-600 px-4 py-2 text-cyan-300 disabled:opacity-50"><Eye className="h-4 w-4" />{busy ? 'Preparing…' : 'Preview Email'}</button>
    </div>
    <ProposalCheckHistory refreshKey={historyRefresh} />
    <p className="text-xs text-gray-400">Send when you&apos;re ready. The owner note works well after the salesperson has followed up. Customer replies arrive by email.</p>

    {preview && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Email preview">
        <div className={`flex max-h-[95vh] w-full ${previewExpanded ? 'max-w-6xl' : 'max-w-3xl'} flex-col overflow-hidden rounded-2xl border border-gray-600 bg-gray-800 shadow-2xl transition-all`}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-gray-700 bg-gray-900 px-4 py-3">
            <h3 className="truncate text-sm font-semibold text-white sm:text-base">Email Preview</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setPreviewExpanded(!previewExpanded)} disabled={busy} title={previewExpanded ? 'Compact view' : 'Expand view'} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"><Maximize2 className="h-4 w-4" /></button>
              <button onClick={() => !busy && setPreview(null)} disabled={busy} title="Close" className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {/* Email metadata */}
            <div className="space-y-2 rounded-xl border border-gray-600 bg-gray-900 p-4 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"><strong className="shrink-0 text-gray-300">To:</strong><span className="truncate text-gray-400">{preview.recipient}</span></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"><strong className="shrink-0 text-gray-300">From:</strong><span className="truncate text-gray-400">{preview.sender}</span></div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"><strong className="shrink-0 text-gray-300">Replies to:</strong><span className="truncate text-gray-400">{preview.reply_to}</span></div>
              <div className="flex flex-col gap-1 border-t border-gray-700 pt-2 sm:flex-row sm:items-start sm:gap-2">
                <strong className="mt-2 shrink-0 text-gray-300">Subject:</strong>
                <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} disabled={busy} maxLength={300} className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none" />
              </div>
            </div>

            {/* Edit / Reset toolbar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setIsEditing(!isEditing)} disabled={busy} className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-400 disabled:opacity-50"><Pencil className="h-4 w-4" />{isEditing ? 'Hide Editor' : 'Edit Email Content'}</button>
              <button onClick={() => { setEditedSubject(preview.subject); setEditedContent(preview.content); }} disabled={busy || !isDirty} className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-400 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Reset to Original</button>
            </div>

            {/* Editable textarea */}
            {isEditing && (
              <div className="mt-3 space-y-2">
                <label className="block text-sm font-medium text-gray-300">Email body (HTML)</label>
                <textarea value={editedContent} onChange={e => setEditedContent(e.target.value)} disabled={busy} rows={12} className="block w-full resize-y rounded-lg border border-gray-600 bg-gray-900 p-3 font-mono text-xs text-white focus:border-cyan-400 focus:outline-none sm:text-sm" />
                <p className="text-xs text-gray-400">Edit the email body above. The preview below updates live. HTML formatting is supported.</p>
              </div>
            )}

            {/* Live preview iframe */}
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-600">
              <div className="border-b border-gray-600 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-400">Live Preview</div>
              <iframe title="Proposal follow-up email preview" sandbox="" srcDoc={livePreviewHtml} className="h-[400px] w-full bg-white sm:h-[500px]" />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex flex-col-reverse gap-2 border-t border-gray-700 bg-gray-900 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-400">{isDirty ? 'You have unsaved edits — your changes will be sent.' : 'No edits made — the original template will be sent.'}</p>
            <div className="flex gap-2">
              <button onClick={() => !busy && setPreview(null)} disabled={busy} className="flex min-h-11 items-center justify-center rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-400 disabled:opacity-50">Cancel</button>
              <button onClick={() => void act(true)} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Sending…' : 'Send This Email'}</button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>;
}
