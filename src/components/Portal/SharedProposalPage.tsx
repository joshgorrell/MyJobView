import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Scope = { rooms: { id: string; name: string; description: string | null }[]; items: { id: string; roomId: string | null; description: string; quantity: number }[] };
type Representative = { name: string; email: string | null; phone: string | null };
type Summary = { id: string; number: string; title: string; status: string; total: number; expiresAt: string | null };
export default function SharedProposalPage() {
  const [proposal, setProposal] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const [representative, setRepresentative] = useState<Representative | null>(null);
  const [showDeclineHelp, setShowDeclineHelp] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setError('This proposal link is incomplete.'); return; }
    supabase.functions.invoke('view-shared-proposal', { body: { token } }).then(({ data, error: failure }) => {
      if (failure || !data?.proposal) { setError('This proposal link is invalid, expired, or no longer available.'); return; }
      setProposal(data.proposal);
      setScope(data.scope || null);
      setRepresentative(data.representative || null);
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
        {scope && <section className="mt-8 border-t border-gray-700 pt-6" aria-label="Proposal scope">
          <h2 className="text-lg font-semibold">Scope of Work</h2>
          {scope.rooms.map(room => <div key={room.id} className="mt-5">
            <h3 className="font-semibold text-blue-300">{room.name}</h3>
            {room.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{room.description}</p>}
            <ul className="mt-2 space-y-1 text-sm text-gray-200">{scope.items.filter(item => item.roomId === room.id).map(item => <li key={item.id}>{item.quantity} × {item.description}</li>)}</ul>
          </div>)}
          {scope.items.some(item => !item.roomId) && <div className="mt-5"><h3 className="font-semibold text-blue-300">Additional Items</h3><ul className="mt-2 space-y-1 text-sm text-gray-200">{scope.items.filter(item => !item.roomId).map(item => <li key={item.id}>{item.quantity} × {item.description}</li>)}</ul></div>}
        </section>}
        {representative && <section className="mt-8 border-t border-gray-700 pt-5"><h2 className="font-semibold">Contact your representative: {representative.name}</h2><div className="mt-3 flex gap-4">{representative.phone && <a href={'tel:' + representative.phone.replace(/[^+0-9]/g, '')} className="text-blue-300 underline">Call</a>}{representative.email && <a href={'mailto:' + representative.email} className="text-blue-300 underline">Email</a>}</div></section>}
        {['sent', 'portal'].includes(proposal.status) && <section className="mt-8 border-t border-gray-700 pt-6">
          <h2 className="text-lg font-semibold">Need to make a change?</h2>
          <p className="mt-2 text-sm text-gray-300">We can easily adjust the scope to make this proposal right for you.</p>
          {representative?.email && <a href={'mailto:' + representative.email + '?subject=' + encodeURIComponent('Changes requested for proposal ' + proposal.number)} className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">Request Changes</a>}
          <div className="mt-5"><button type="button" onClick={() => setShowDeclineHelp(value => !value)} className="text-sm text-gray-300 underline underline-offset-2">{showDeclineHelp ? 'Hide decline information' : 'Considering declining?'}</button></div>
          {showDeclineHelp && <div className="mt-3 rounded-lg border border-blue-700 bg-blue-950/50 p-4">
            <h3 className="font-semibold text-white">The Best Price. Guaranteed.</h3>
            <p className="mt-2 text-sm text-blue-100">We want your proposal to be the perfect fit. Changes are easy, and we guarantee the best price against any competitor for the same scope of work. If you've received a better quote, give us the opportunity to match or beat it.</p>
            <p className="mt-3 text-sm text-gray-200">To decline, contact your representative. This shared link does not submit a decline or change your proposal status.</p>
            {representative?.email && <a href={'mailto:' + representative.email + '?subject=' + encodeURIComponent('Proposal ' + proposal.number + ' — decision')} className="mt-3 inline-block text-sm font-semibold text-blue-200 underline">Email your representative</a>}
          </div>}
        </section>}
        <p className="mt-8 border-t border-gray-700 pt-5 text-sm text-gray-400">This is a read-only summary. For the complete proposal, approval, or attachments, please contact your representative.</p>
      </> : <p className="mt-8 text-gray-400">Loading your proposal…</p>}
    </div>
  </main>;
}
