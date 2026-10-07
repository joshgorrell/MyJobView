import { useEffect, useState } from 'react';
import { Mail, Eye, Send, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { lostReviewAction } from './lostReview';

export default function ProposalFollowUps() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'owner', 'super_admin'].includes(profile?.role || '');
  const [proposals, setProposals] = useState<{ id: string; title: string; proposal_number: string; contacts: { contact_name: string } | null }[]>([]);
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
    supabase.from('proposals').select('id,title,proposal_number,contacts:contact_id(contact_name)')
      .eq('organization_id', profile.organization_id).in('status', ['sent', 'viewed']).not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setProposals((data || []) as unknown as typeof proposals);
        setLoading(false);
      });
    return () => { active = false; };
  }, [profile?.organization_id]);
  const reset = () => { setPreview(null); setSent(false); setError(''); setSendKey(''); };
  async function act(send: boolean) {
    setBusy(true); setError('');
    try {
      const data = await lostReviewAction({ action: send ? 'proposal_send' : 'proposal_preview', proposal_id: proposal, variant, send_key: sendKey });
      if (send) { setSent(true); setPreview(null); }
      else { setPreview(data); setSendKey(crypto.randomUUID()); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to prepare email.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 rounded-xl border border-cyan-800/50 bg-gray-800 p-4 sm:p-6">
    <div className="flex items-start gap-3"><Mail className="mt-1 h-6 w-6 text-cyan-400" /><div><h2 className="text-xl font-bold text-white">A thoughtful follow-up. A better experience.</h2><p className="mt-1 text-sm text-gray-400">Thank customers for the opportunity and ask what would help earn their business.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(['sales', ...(isAdmin ? ['owner'] : [])] as ('sales' | 'owner')[]).map(v => <button key={v} disabled={busy} onClick={() => { setVariant(v); reset(); }} className={`rounded-xl border p-4 text-left transition ${variant === v ? 'border-cyan-400 bg-cyan-950/40' : 'border-gray-600 hover:border-gray-400'}`} aria-pressed={variant === v}><div className="font-semibold text-white">{v === 'owner' ? 'Owner Proposal Follow-Up' : 'Proposal Follow-Up'}</div><p className="mt-1 text-sm text-gray-400">{v === 'owner' ? 'A personal note from Josh Gorrell. Replies go directly to Josh.' : 'A warm check-in from the proposal’s salesperson. Replies go directly to them.'}</p></button>)}
    </div>
    <label className="block text-sm font-medium text-gray-300">Open proposal<select disabled={busy || loading} value={proposal} onChange={e => { setProposal(e.target.value); reset(); }} className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-white"><option value="">{loading ? 'Loading proposals…' : 'Choose a sent proposal…'}</option>{proposals.map(p => <option key={p.id} value={p.id}>{p.contacts?.contact_name || 'Customer'} · {p.proposal_number} · {p.title}</option>)}</select></label>
    {!loading && !proposals.length && <p className="text-sm text-gray-400">No open, sent proposals are available.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-950/50 p-3 text-red-300">{error}</p>}
    {sent && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-950/50 p-3 text-emerald-300"><CheckCircle className="h-5 w-5" />Proposal follow-up sent successfully.</p>}
    {preview && <div className="overflow-hidden rounded-xl border border-gray-600"><div className="space-y-1 bg-gray-900 p-4 text-sm text-gray-300"><p><strong>Subject:</strong> {preview.subject}</p><p><strong>To:</strong> {preview.recipient}</p><p><strong>From:</strong> {preview.sender}</p><p><strong>Replies to:</strong> {preview.reply_to}</p></div><iframe title="Proposal follow-up email preview" sandbox="" srcDoc={preview.html} className="h-[650px] max-h-[70vh] w-full bg-white" /></div>}
    <div className="flex flex-wrap gap-3"><button disabled={!proposal || busy || sent} onClick={() => void act(false)} className="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-600 px-4 py-2 text-cyan-300 disabled:opacity-50"><Eye className="h-4 w-4" />{busy ? 'Preparing…' : 'Preview Email'}</button>{preview && <button disabled={busy} onClick={() => void act(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Sending…' : 'Send This Email'}</button>}</div>
    <p className="text-xs text-gray-400">Send when you’re ready. The owner note works well after the salesperson has followed up. Customer replies arrive by email.</p>
  </div>;
}
