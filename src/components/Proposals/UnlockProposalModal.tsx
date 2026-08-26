import React, { useState } from 'react';
import { AlertTriangle, Unlock, X, Globe2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UnlockProposalModalProps {
  proposalId?: string;
  proposalNumber: string;
  onCreateRevision: () => void;
  onUnlockAndEdit: () => void;
  onClose: () => void;
}

export function UnlockProposalModal({
  proposalId,
  proposalNumber,
  onUnlockAndEdit,
  onClose,
}: UnlockProposalModalProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function handleTakeOfflineAndUnlock() {
    if (working) return;
    setWorking(true);
    setError('');

    try {
      const query = supabase
        .from('proposals')
        .update({
          status: 'designing',
          sent_at: null,
          is_portal_visible: false,
          is_locked: false,
          locked_at: null,
          locked_by: null,
        });

      const { error: offlineError } = proposalId
        ? await query.eq('id', proposalId)
        : await query.eq('proposal_number', proposalNumber);

      if (offlineError) throw offlineError;

      await Promise.resolve(onUnlockAndEdit());
      onClose();
    } catch (e: any) {
      console.error('Failed to take proposal offline and unlock:', e);
      setError(e?.message || 'Unable to unlock this proposal. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-800 shadow-2xl sm:max-w-lg sm:rounded-xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-700 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-500/10">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-white sm:text-xl">Unlock Proposal?</h2>
              <p className="truncate text-sm text-gray-400">Proposal #{proposalNumber}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={working} className="flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="mb-1 text-sm font-medium text-yellow-100">This proposal has already been delivered to the customer.</p>
            <p className="text-sm leading-relaxed text-yellow-200/80">
              Unlocking allows changes. If it is live in the Customer Portal, MyJobView takes it offline first so the customer never sees edits happening in real time.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/30 p-4">
            <div className="flex items-start gap-3">
              <Globe2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
              <div>
                <p className="text-sm font-semibold text-white">Customer portal goes offline</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">The last published version stays preserved in portal version history.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Unlock className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
              <div>
                <p className="text-sm font-semibold text-white">Proposal becomes editable</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">Preview changes privately, then publish the updated proposal when it is ready.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <p className="text-xs leading-relaxed text-blue-200">Questions and comments stay with this proposal. Taking it offline does not erase the customer discussion history.</p>
          </div>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        </div>

        <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-700 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            onClick={onClose}
            disabled={working}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={handleTakeOfflineAndUnlock}
            disabled={working}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Unlock className="h-4 w-4" />
            {working ? 'Taking Offline...' : 'Take Offline & Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
