import { useEffect, useState } from 'react';
import { RotateCcw, AlertTriangle, Calendar, Globe, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReactivateProposalModalProps {
  proposalId: string;
  proposalNumber: string;
  lastModified: string;
  totalAmount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReactivateProposalModal({
  proposalId,
  proposalNumber,
  lastModified,
  totalAmount,
  onClose,
  onSuccess
}: ReactivateProposalModalProps) {
  const [makePortalVisible, setMakePortalVisible] = useState(true);
  const [expirationDays, setExpirationDays] = useState<number | null>(null);
  const [policyError, setPolicyError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.from('proposals').select('organization_id').eq('id', proposalId).single()
      .then(async ({ data, error }) => {
        if (error || !data?.organization_id) throw error || new Error('Organization not found');
        const policy = await supabase.from('organizations').select('proposal_approval_days').eq('id', data.organization_id).single();
        if (policy.error) throw policy.error;
        if (active) setExpirationDays(policy.data?.proposal_approval_days ?? 30);
      })
      .catch(() => { if (active) setPolicyError('Could not load dealer approval policy. Please try again.'); });
    return () => { active = false; };
  }, [proposalId]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function calculateExpirationDate() {
    if (expirationDays === null) throw new Error('Dealer approval policy is not loaded');
    const date = new Date();
    date.setDate(date.getDate() + expirationDays);
    return date.toISOString();
  }

  function getFormattedExpirationDate() {
    try {
      const date = new Date(calculateExpirationDate());
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  }

  function getDaysOld() {
    const lastModifiedDate = new Date(lastModified);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastModifiedDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return `${diffDays} days`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'}`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} ${years === 1 ? 'year' : 'years'}`;
    }
  }

  async function handleReactivate() {
    setSubmitting(true);
    try {
      if (expirationDays === null || policyError) return;
      const expiresAt = calculateExpirationDate();

      const { error } = await supabase
        .from('proposals')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
          is_portal_visible: makePortalVisible,
          updated_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      if (error) throw error;

      // Optionally add to activity log
      if (notes.trim()) {
        await supabase.from('proposal_activity').insert({
          proposal_id: proposalId,
          activity_type: 'reactivated',
          metadata: { notes: notes.trim() }
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error reopening proposal:', error);
      alert('Failed to reopen proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <RotateCcw size={20} className="text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Reopen for Customer {proposalNumber}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Warning Banner */}
          <div className="bg-orange-50 border-l-4 border-orange-500 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-orange-600 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-900 mb-1">
                  This proposal is {getDaysOld()} old
                </p>
                <p className="text-sm text-orange-800">
                  Please review pricing and terms before reopening to ensure they are still accurate.
                </p>
              </div>
            </div>
          </div>

          {/* Proposal Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last Modified:</span>
              <span className="text-sm font-semibold text-gray-900">
                {new Date(lastModified).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Current Total:</span>
              <span className="text-sm font-semibold text-gray-900">
                ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Portal Visibility Toggle */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Globe size={20} />
              Customer Portal Access
            </h3>
            <label className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={makePortalVisible}
                onChange={(e) => setMakePortalVisible(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900 mb-1">Make visible on customer portal</div>
                <div className="text-sm text-gray-600">
                  Customer can view and approve this proposal through their online portal
                </div>
              </div>
            </label>
          </div>

          {/* Dealer-wide approval and viewing policy — not a per-proposal override. */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-semibold text-blue-950 flex items-center gap-2"><Calendar size={18} />Approval &amp; viewing window</h3>
            {policyError ? <p className="mt-2 text-sm text-red-700">{policyError}</p> : expirationDays === null
              ? <p className="mt-2 text-sm text-blue-800">Loading dealer policy…</p>
              : <p className="mt-2 text-sm text-blue-900">Your dealer policy allows {expirationDays} days for viewing and approval. Resubmission restarts this window, expiring {getFormattedExpirationDate()}.</p>}
          </div>

          {/* Optional Notes */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText size={20} />
              Internal Notes (Optional)
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about reopening this proposal for internal tracking..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-xl flex justify-end gap-3">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReactivate}
              disabled={submitting || expirationDays === null || Boolean(policyError)}
              className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 font-medium transition-all flex items-center gap-2"
            >
              <RotateCcw size={18} />
              {submitting ? 'Reopening...' : 'Reopen for Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
