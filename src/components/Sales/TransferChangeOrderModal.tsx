import { useState } from 'react';
import { X, ArrowUpRight, AlertTriangle, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ChangeOrderSummary } from './SalesOrderDetail';

interface TransferChangeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeOrder: ChangeOrderSummary;
  salesOrderNumber: string;
  contactName: string;
  onSuccess: (newProposalId: string) => void;
}

export function TransferChangeOrderModal({
  isOpen,
  onClose,
  changeOrder,
  salesOrderNumber,
  contactName,
  onSuccess,
}: TransferChangeOrderModalProps) {
  const [proposalTitle, setProposalTitle] = useState(changeOrder.title);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleTransfer() {
    if (!proposalTitle.trim()) {
      setError('Proposal title is required.');
      return;
    }

    setTransferring(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'transfer_change_order_to_proposal',
        {
          p_change_order_id: changeOrder.id,
          p_proposal_title: proposalTitle.trim(),
        }
      );

      if (rpcError) throw rpcError;

      onSuccess(data as string);
    } catch (err: any) {
      console.error('Transfer failed:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setTransferring(false);
    }
  }

  const fmtCurrency = (n: number) =>
    '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700/60 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base leading-tight">Transfer to Proposal</h2>
              <p className="text-gray-500 text-xs mt-0.5">SO #{salesOrderNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={transferring}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Change order summary card */}
          <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-white font-medium text-sm truncate">{changeOrder.title}</span>
              </div>
              <span className="text-xs font-mono text-gray-500 flex-shrink-0">{changeOrder.change_order_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Customer</p>
                <p className="text-sm text-gray-300">{contactName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Change Amount</p>
                <p className={`text-sm font-semibold ${changeOrder.change_amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {changeOrder.change_amount >= 0 ? '+' : '-'}{fmtCurrency(changeOrder.change_amount)}
                </p>
              </div>
            </div>
          </div>

          {/* Proposal title input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Proposal Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={proposalTitle}
              onChange={e => { setProposalTitle(e.target.value); setError(null); }}
              disabled={transferring}
              className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              placeholder="Enter a title for the new proposal"
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 px-3 py-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed">
              This change order will be removed from the sales order and a new{' '}
              <span className="font-semibold">draft proposal</span> will be created with the same
              rooms, parts, and pricing. The action cannot be undone.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-900/30 border border-red-700/40 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={transferring}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={transferring || !proposalTitle.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transferring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Transfer to Proposal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
