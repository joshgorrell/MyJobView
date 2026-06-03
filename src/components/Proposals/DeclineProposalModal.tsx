import React, { useState } from 'react';
import { X, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DECLINE_REASONS = [
  { value: 'price_too_high', label: 'Price Too High' },
  { value: 'went_with_competitor', label: 'Went with a Competitor' },
  { value: 'project_cancelled', label: 'Project Cancelled' },
  { value: 'no_response', label: 'No Response / Unresponsive' },
  { value: 'timing', label: 'Not the Right Time' },
  { value: 'budget_cut', label: 'Budget Cut' },
  { value: 'scope_change', label: 'Scope Changed / Not What Was Expected' },
  { value: 'changed_mind', label: 'Changed My Mind' },
  { value: 'dont_want_rep', label: "Does Not Want to Work with This Rep" },
  { value: 'dont_want_company', label: 'Does Not Want to Work with This Company' },
  { value: 'other', label: 'Other' },
];

const CANCEL_REASONS = [
  { value: 'duplicate', label: 'Duplicate Proposal' },
  { value: 'customer_request', label: 'Customer Requested Cancellation' },
  { value: 'project_cancelled', label: 'Project Cancelled' },
  { value: 'error', label: 'Created in Error' },
  { value: 'replaced_by_revision', label: 'Replaced by Revision' },
  { value: 'other', label: 'Other' },
];

interface DeclineProposalModalProps {
  proposalId: string;
  proposalNumber: string;
  customerName: string;
  /** 'decline' = customer said no, 'cancel' = rep/company decided not to pursue */
  mode: 'decline' | 'cancel';
  onClose: () => void;
  onSuccess: () => void;
}

export function DeclineProposalModal({
  proposalId,
  proposalNumber,
  customerName,
  mode,
  onClose,
  onSuccess,
}: DeclineProposalModalProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDecline = mode === 'decline';
  const reasons = isDecline ? DECLINE_REASONS : CANCEL_REASONS;
  const newStatus = isDecline ? 'declined' : 'cancelled';
  const title = isDecline ? 'Decline Proposal' : 'Cancel Proposal';
  const actionLabel = isDecline ? 'Mark as Declined' : 'Mark as Cancelled';
  const description = isDecline
    ? 'Record why this customer declined. This helps track trends and improve future proposals.'
    : 'Cancel this proposal to remove it from the active pipeline.';

  async function handleSubmit() {
    if (!reason) {
      setError('Please select a reason.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('proposals')
        .update({
          status: newStatus,
          decline_reason: reason,
          decline_notes: notes.trim() || null,
          declined_at: new Date().toISOString(),
          declined_by: 'rep',
        })
        .eq('id', proposalId);

      if (updateError) throw updateError;

      // Log activity
      await supabase.from('proposal_activity').insert({
        proposal_id: proposalId,
        activity_type: newStatus,
        metadata: { reason, notes: notes.trim() || null, by: 'rep' },
      }).throwOnError().catch(() => {
        // Non-fatal if activity log fails
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDecline ? 'bg-red-900/40' : 'bg-gray-700'}`}>
              {isDecline ? (
                <XCircle size={20} className="text-red-400" />
              ) : (
                <AlertTriangle size={20} className="text-gray-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-xs text-gray-400">
                {proposalNumber} &mdash; {customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">{description}</p>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Reason <span className="text-red-400">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Select a reason...</option>
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Additional Notes <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={isDecline ? 'e.g. Customer chose XYZ competitor due to faster lead time...' : 'e.g. Customer decided to delay project until next year...'}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none placeholder-gray-600"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isDecline
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
          >
            {submitting ? 'Saving...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
