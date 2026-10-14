import { useEffect, useState } from 'react';
import { CalendarDays, Check, Copy, Download, Globe, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReactivateProposalModalProps {
  proposalId: string;
  proposalNumber: string;
  proposalTitle?: string;
  customerName?: string;
  lastModified: string;
  totalAmount: number;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  onDownloadPdf?: () => void;
}

export function ReactivateProposalModal({
  proposalId, proposalNumber, proposalTitle, customerName, onClose, onSuccess,
  onDownloadPdf,
}: ReactivateProposalModalProps) {
  const [portalVisible, setPortalVisible] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [policyError, setPolicyError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.from('proposals').select('organization_id').eq('id', proposalId).single()
      .then(async ({ data, error }) => {
        if (error || !data?.organization_id) throw error || new Error('Organization not found');
        const result = await supabase.from('organizations').select('proposal_approval_days').eq('id', data.organization_id).single();
        if (result.error) throw result.error;
        if (mounted) setDays(result.data?.proposal_approval_days ?? 30);
      })
      .catch(() => { if (mounted) setPolicyError('Unable to load expiration setting. Please try again.'); });
    return () => { mounted = false; };
  }, [proposalId]);

  const expiration = days === null ? '' : (() => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  async function activate(makeVisible: boolean, copyAfter = false) {
    if (submitting || (days === null && !active)) return;
    setSubmitting(true);
    setMessage('');
    try {
      if (!active) {
        const date = new Date();
        date.setDate(date.getDate() + (days ?? 30));
        const { error } = await supabase.from('proposals').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          expires_at: date.toISOString(),
          is_portal_visible: makeVisible,
          updated_at: new Date().toISOString(),
        }).eq('id', proposalId);
        if (error) throw error;
        setActive(true);
      } else if (makeVisible !== portalVisible) {
        const { error } = await supabase.from('proposals').update({ is_portal_visible: makeVisible }).eq('id', proposalId);
        if (error) throw error;
      }
      setPortalVisible(makeVisible);
      await onSuccess();
      if (copyAfter) {
        const { data, error: linkError } = await supabase.functions.invoke('manage-proposal-share-link', {
          body: { proposalId, action: 'create' },
        });
        if (linkError || !data?.token) throw linkError || new Error('Could not create the customer link');
        const url = new URL('/shared/proposal', window.location.origin);
        url.searchParams.set('token', data.token);
        await navigator.clipboard.writeText(url.toString());
      }
      setMessage(copyAfter ? 'Customer link copied.' : 'Proposal is active.');
    } catch (error) {
      console.error('Proposal activation failed', error);
      setMessage(active ? 'Unable to complete that action. Please try again.' : 'Unable to complete the action. If the proposal was activated, you can retry copying its link.');
    } finally {
      setSubmitting(false);
    }
  }

  const actionClass = 'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-3 text-xs sm:text-sm font-medium text-white transition-colors hover:border-blue-400 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <div className="flex w-full max-w-xl max-h-[94dvh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-700 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Proposal delivery</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{customerName || 'Customer'}</h2>
            <p className="mt-1 break-words text-sm text-slate-300">{proposalTitle || 'Proposal'} <span className="text-slate-500">·</span> {proposalNumber}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          <p className="mb-3 text-sm font-semibold text-slate-200">Choose any delivery options</p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={onDownloadPdf} className={actionClass}><Download size={19} className="text-blue-300" />PDF</button>
            <button type="button" onClick={() => void activate(portalVisible, true)} disabled={submitting || days === null} className={actionClass}><Copy size={19} className="text-blue-300" />Copy link</button>
            <button type="button" onClick={() => void activate(!portalVisible)} disabled={submitting || days === null} className={actionClass}>
              {portalVisible ? <Check size={19} className="text-green-400" /> : <Globe size={19} className="text-blue-300" />}
              {portalVisible ? 'Portal on' : 'Portal'}
            </button>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-800/70 px-4 py-3 text-sm text-slate-200">
            <CalendarDays size={18} className="shrink-0 text-blue-300" />
            <span>{policyError || (expiration ? `New expiration: ${expiration}` : 'Loading expiration…')}</span>
          </div>
          {message && <p role="status" className="mt-3 text-sm text-blue-200">{message}</p>}
          <p className="mt-3 text-xs text-slate-400">Copy link or send to portal activates the proposal. PDF does not change its status.</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-5 text-sm font-medium text-slate-200 hover:bg-slate-800">Done</button>
        </div>
      </div>
    </div>
  );
}
