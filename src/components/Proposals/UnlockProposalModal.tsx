import React, { useState } from 'react';
import { AlertTriangle, Unlock, X, Globe2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UnlockProposalModalProps {
  proposalNumber: string;
  onCreateRevision: () => void;
  onUnlockAndEdit: () => void;
  onClose: () => void;
}

export function UnlockProposalModal({
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
      // Safety rule: a proposal may never remain customer-visible while it is editable.
      // Use the same state transition already used by the existing Recall from Portal flow.
      const { error: offlineError } = await supabase
        .from('proposals')
        .update({
          status: 'designing',
          sent_at: null,
          is_portal_visible: false,
          is_locked: false,
          locked_at: null,
          locked_by: null,
        })
        .eq('proposal_number', proposalNumber);

      if (offlineError) throw offlineError;

      // Keep the existing parent callback so any current unlock audit/RPC behavior still runs.
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-700">
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Unlock Proposal?</h2>
              <p className="text-sm text-gray-400">Proposal #{proposalNumber}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={working} className="text-gray-400 hover:text-white transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-sm text-yellow-100 font-medium mb-1">This proposal has already been delivered to the customer.</p>
            <p className="text-sm text-yellow-200/80">
              Unlocking allows you to make changes. If it is currently live in the Customer Portal, MyJobView will take it offline first so the customer never watches edits happen in real time.
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-750 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Globe2 className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Customer portal goes offline</p>
                <p className="text-xs text-gray-400 mt-0.5">The last published portal version remains preserved in version history.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Unlock className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Proposal becomes editable</p>
                <p className="text-xs text-gray-400 mt-0.5">Preview your changes privately, then publish the updated proposal when it is ready.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <p className="text-xs text-blue-200">
              Questions and comments stay with this proposal. Taking it offline does not erase the customer discussion history.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={working}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleTakeOfflineAndUnlock}
            disabled={working}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Unlock className="w-4 h-4" />
            {working ? 'Taking Offline...' : 'Take Offline & Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
