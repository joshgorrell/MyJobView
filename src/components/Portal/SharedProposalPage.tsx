import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { PortalProposalDetail } from './PortalProposalDetail';

type Summary = { id: string; number: string; title: string; status: string; total: number; expiresAt: string | null };
export default function SharedProposalPage() {
  const { user, profile, loading } = useAuth();
  const [proposal, setProposal] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setChecking(true); setAuthorized(false); setError('');
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setError('This proposal link is incomplete.'); setChecking(false); return; }
    void (async () => {
      try {
        const { data, error: failure } = await supabase.functions.invoke('view-shared-proposal', { body: { token } });
        if (cancelled) return;
        if (failure || !data?.proposal) throw new Error('This proposal link is invalid, expired, revised, or no longer available.');
        setProposal(data.proposal);
        if (user) {
          // Possessing a share token does not authorize customer decisions. The
          // same proposal/customer resolver used by the portal verifies identity.
          const { data: access, error: denied } = await supabase.rpc('get_proposal_display_template', { p_proposal_id: data.proposal.id, p_template_id: null });
          if (cancelled) return;
          if (denied || !access) throw new Error('This proposal is not available to this account. Sign in with the customer account for this proposal.');
          setAuthorized(true);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Unable to open this proposal. Please contact your representative.');
      } finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [loading, user?.id]);
  if (authorized && proposal && !checking && !error) return <PortalProposalDetail proposalId={proposal.id} onBack={() => window.location.assign('/portal/proposals')} backLabel="Your proposals" previewMode={!['portal_user', 'customer'].includes(profile?.role || '')} />;
  return <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 p-6 sm:p-10 shadow-xl">
      <p className="text-sm font-semibold tracking-widest text-blue-400">MYJOBVIEW · SHARED PROPOSAL</p>
      {error ? <div role="alert" className="mt-8 text-red-300">{error}</div> : checking ? <p role="status" className="mt-8 text-gray-300">Checking your proposal link…</p> : proposal && <>
        <p className="mt-8 text-sm text-gray-400">Proposal #{proposal.number}</p>
        <h1 className="mt-2 break-words text-2xl font-bold">{proposal.title || 'Your proposal'}</h1>
        <p className="mt-5 capitalize text-gray-300">Status: {proposal.status}</p>
        <p className="mt-4 text-3xl font-bold">{Number(proposal.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>
        <p className="mt-6 text-gray-300">Sign in to review your complete proposal, attachments and payment options, approve, decline, or request changes.</p>
        <a className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700" href={'/portal?redirect=' + encodeURIComponent('/portal/proposals/' + proposal.id)}>Sign in to review and respond</a>
      </>}
    </div>
  </main>;
}
