import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Summary = { id: string; number: string; title: string; status: string; total: number; expiresAt: string | null };
export default function SharedProposalPage() {
  const [proposal, setProposal] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setError('This proposal link is incomplete.'); return; }
    supabase.functions.invoke('view-shared-proposal', { body: { token } }).then(({ data, error: failure }) => {
      if (failure || !data?.proposal) { setError('This proposal link is invalid, expired, or no longer available.'); return; }
      setProposal(data.proposal);
    }).catch(() => setError('Unable to open this proposal. Please contact your representative.'));
  }, []);
  return <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 p-6 sm:p-10 shadow-xl">
      <p className="text-sm font-semibold tracking-widest text-blue-400">MYJOBVIEW · SHARED PROPOSAL</p>
      {error ? <div role="alert" className="mt-8 text-red-300">{error}</div> : proposal ? <>
        <p className="mt-8 text-sm text-gray-400">Proposal #{proposal.number}</p>
        <h1 className="mt-2 text-2xl font-bold">{proposal.title || 'Your proposal'}</h1>
        <p className="mt-5 text-gray-300">Status: <span className="font-semibold capitalize">{proposal.status}</span></p>
        <p className="mt-4 text-3xl font-bold">{Number(proposal.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>
        {proposal.expiresAt && <p className="mt-4 text-sm text-gray-400">Expiration: {new Date(proposal.expiresAt).toLocaleDateString()}</p>}
        <p className="mt-8 border-t border-gray-700 pt-5 text-sm text-gray-400">This is a read-only summary. For the complete proposal, approval, or attachments, please contact your representative.</p>
      </> : <p className="mt-8 text-gray-400">Loading your proposal…</p>}
    </div>
  </main>;
}
