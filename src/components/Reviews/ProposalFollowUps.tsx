import { useEffect, useState } from 'react';
import { Mail, Eye, Send, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { lostReviewAction } from './lostReview';

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
  const [preview, setPreview] = useState<{ html: string; subject: string; recipient: string; reply_to: string; sender: string } | null>(null);
  const [sendKey, setSendKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const reset = () => { setPreview(null); setSent(false); setError(''); setSendKey(''); };
  async function act(send: boolean) {
    setBusy(true); setError('');
    try {
      const data = await lostReviewAction({ action: send ? 'proposal_send' : 'proposal_preview', recipient_mode: mode, proposal_id: mode === 'proposal' ? proposal : undefined, contact_id: mode === 'customer' ? contact : undefined, recipient_name: mode === 'manual' ? name : undefined, recipient_email: mode === 'manual' ? email : undefined, variant, send_key: sendKey });
      if (send) { setSent(true); setPreview(null); }
      else { setPreview(data); setSendKey(crypto.randomUUID()); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to prepare email.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 rounded-xl border border-cyan-800/50 bg-gray-800 p-4 sm:p-6">
    <div className="flex items-start gap-3"><Mail className="mt-1 h-6 w-6 text-cyan-400" /><div><h2 className="text-xl font-bold text-white">A thoughtful follow-up. A better experience.</h2><p className="mt-1 text-sm text-gray-400">Thank customers for the opportunity and ask what would help earn their business.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(['sales', ...(isJosh ? ['owner'] : [])] as ('sales' | 'owner')[]).map(v => <button key={v} disabled={busy} onClick={() => { setVariant(v); reset(); }} className={`rounded-xl border p-4 text-left transition ${variant === v ? 'border-cyan-400 bg-cyan-950/40' : 'border-gray-600 hover:border-gray-400'}`} aria-pressed={variant === v}><div className="font-semibold text-white">{v === 'owner' ? 'Owner Proposal Follow-Up' : 'Proposal Follow-Up'}</div><p className="mt-1 text-sm text-gray-400">{v === 'owner' ? 'A personal note from Josh Gorrell. Replies go directly to Josh.' : 'A warm check-in from you, or the linked proposal’s salesperson. Replies go directly to the sender.'}</p></button>)}
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose recipient method">{([['customer', 'Select Customer'], ['manual', 'Enter Name & Email'], ['proposal', 'Link a Proposal']] as const).map(([value, label]) => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); reset(); }} className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${mode === value ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200' : 'border-gray-600 text-gray-300'}`}>{label}</button>)}</div>
    {mode === 'customer' && <div className="space-y-3"><label className="block text-sm font-medium text-gray-300">Search customers<input disabled={busy} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><label className="block text-sm font-medium text-gray-300">Customer<select disabled={busy || loading} value={contact} onChange={e => { setContact(e.target.value); reset(); }} className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"><option value="">{loading ? 'Loading customers…' : 'Choose a customer…'}</option>{contacts.filter(c => c.id === contact || `${c.contact_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())).map(c => <option key={c.id} value={c.id} disabled={!c.email}>{c.contact_name} · {c.email || 'No email address'}</option>)}</select></label><p className="text-xs text-gray-400">No proposal link is required. The salesperson version comes from you.</p></div>}
    {mode === 'manual' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-300">Customer name<input disabled={busy} maxLength={200} value={name} onChange={e => { setName(e.target.value); reset(); }} autoComplete="name" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><label className="block text-sm font-medium text-gray-300">Email address<input type="email" disabled={busy} maxLength={254} value={email} onChange={e => { setEmail(e.target.value); reset(); }} autoComplete="email" className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></label><p className="text-xs text-gray-400 sm:col-span-2">Send without creating a customer record or linking a proposal.</p></div>}
    {mode === 'proposal' && <label className="block text-sm font-medium text-gray-300">Open proposal<select disabled={busy || loading} value={proposal} onChange={e => { setProposal(e.target.value); reset(); }} className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"><option value="">{loading ? 'Loading proposals…' : 'Choose a sent proposal…'}</option>{proposals.map(p => <option key={p.id} value={p.id}>{p.contacts?.contact_name || 'Customer'} · {p.proposal_number} · {p.title}</option>)}</select></label>}
    {error && <p role="alert" className="rounded-lg bg-red-950/50 p-3 text-red-300">{error}</p>}
    {sent && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-950/50 p-3 text-emerald-300"><CheckCircle className="h-5 w-5" />Proposal follow-up sent successfully.</p>}
    {preview && <div className="overflow-hidden rounded-xl border border-gray-600"><div className="space-y-1 bg-gray-900 p-4 text-sm text-gray-300"><p><strong>Subject:</strong> {preview.subject}</p><p><strong>To:</strong> {preview.recipient}</p><p><strong>From:</strong> {preview.sender}</p><p><strong>Replies to:</strong> {preview.reply_to}</p></div><iframe title="Proposal follow-up email preview" sandbox="" srcDoc={preview.html} className="h-[650px] max-h-[70vh] w-full bg-white" /></div>}
    <div className="flex flex-wrap gap-3"><button disabled={(mode === 'proposal' ? !proposal : mode === 'customer' ? !contact : !name.trim() || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email.trim())) || busy || sent} onClick={() => void act(false)} className="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-600 px-4 py-2 text-cyan-300 disabled:opacity-50"><Eye className="h-4 w-4" />{busy ? 'Preparing…' : 'Preview Email'}</button>{preview && <button disabled={busy} onClick={() => void act(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Sending…' : 'Send This Email'}</button>}</div>
    <p className="text-xs text-gray-400">Send when you’re ready. The owner note works well after the salesperson has followed up. Customer replies arrive by email.</p>
  </div>;
}
