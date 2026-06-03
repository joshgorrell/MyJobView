import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface ResubmitProposalModalProps {
  proposalNumber: string;
  onConfirm: (revisionNotes: string) => Promise<void>;
  onClose: () => void;
}

export default function ResubmitProposalModal({
  proposalNumber,
  onConfirm,
  onClose
}: ResubmitProposalModalProps) {
  const [checklist, setChecklist] = useState({
    pricingReviewed: false,
    laborReviewed: false,
    changesCompleted: false
  });
  const [revisionNotes, setRevisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allChecked = checklist.pricingReviewed && checklist.laborReviewed && checklist.changesCompleted;

  function toggleCheckbox(key: keyof typeof checklist) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    if (!allChecked) return;

    try {
      setSubmitting(true);
      await onConfirm(revisionNotes);
      onClose();
    } catch (error) {
      console.error('Error resubmitting proposal:', error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Re-Submit Proposal to Customer</h2>
            <p className="text-sm text-gray-400 mt-1">Proposal #{proposalNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-semibold mb-1">Re-submission Checklist</p>
                <p className="text-blue-200">
                  Before re-submitting this proposal, please verify that all information is current and accurate.
                  This will give the customer a fresh 30-day window to review.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
              Required Verification
            </h3>

            <label className="flex items-start gap-3 p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors group">
              <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                <input
                  type="checkbox"
                  checked={checklist.pricingReviewed}
                  onChange={() => toggleCheckbox('pricingReviewed')}
                  className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-900 text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">I have reviewed all pricing and updated to current</p>
                <p className="text-sm text-gray-400 mt-1">
                  All product prices, labor rates, and material costs reflect current pricing
                </p>
              </div>
              {checklist.pricingReviewed && (
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              )}
            </label>

            <label className="flex items-start gap-3 p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors group">
              <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                <input
                  type="checkbox"
                  checked={checklist.laborReviewed}
                  onChange={() => toggleCheckbox('laborReviewed')}
                  className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-900 text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">I have reviewed labor hours, task notes, and scope for accuracy</p>
                <p className="text-sm text-gray-400 mt-1">
                  All installation hours, programming time, and scope descriptions are accurate
                </p>
              </div>
              {checklist.laborReviewed && (
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              )}
            </label>

            <label className="flex items-start gap-3 p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors group">
              <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                <input
                  type="checkbox"
                  checked={checklist.changesCompleted}
                  onChange={() => toggleCheckbox('changesCompleted')}
                  className="w-5 h-5 rounded border-2 border-gray-600 bg-gray-900 text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">I have made any necessary changes or added revision notes</p>
                <p className="text-sm text-gray-400 mt-1">
                  All requested changes have been incorporated and documented below if needed
                </p>
              </div>
              {checklist.changesCompleted && (
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              )}
            </label>
          </div>

          <div className="space-y-3">
            <label className="block">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">
                  Revision Notes for Customer <span className="text-gray-500">(Optional)</span>
                </span>
                <span className="text-xs text-gray-500">
                  {revisionNotes.length} / 500 characters
                </span>
              </div>
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value.slice(0, 500))}
                placeholder="Example: Updated pricing to reflect current promotions. Added two additional speakers to living room based on our discussion."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-gray-400 mt-2">
                These notes will appear at the top of the proposal when the customer views it,
                helping them understand what changed since the last version.
              </p>
            </label>
          </div>

          {!allChecked && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-sm text-orange-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Please complete all required verification items above to proceed
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allChecked || submitting}
            className={`px-6 py-2.5 rounded-lg font-semibold transition-all ${
              allChecked && !submitting
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Re-Submitting...' : 'Confirm & Re-Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
