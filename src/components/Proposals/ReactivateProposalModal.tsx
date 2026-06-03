import { useState } from 'react';
import { RotateCcw, AlertTriangle, Calendar, Globe, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReactivateProposalModalProps {
  proposalId: string;
  proposalNumber: string;
  lastModified: string;
  totalAmount: number;
  onClose: () => void;
  onSuccess: () => void;
  onReview: () => void;
}

export function ReactivateProposalModal({
  proposalId,
  proposalNumber,
  lastModified,
  totalAmount,
  onClose,
  onSuccess,
  onReview
}: ReactivateProposalModalProps) {
  const [makePortalVisible, setMakePortalVisible] = useState(true);
  const [expirationDays, setExpirationDays] = useState(30);
  const [customDate, setCustomDate] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const presetOptions = [
    { days: 7, label: '7 Days' },
    { days: 14, label: '14 Days' },
    { days: 30, label: '30 Days' },
    { days: 60, label: '60 Days' },
    { days: 90, label: '90 Days' },
  ];

  function calculateExpirationDate() {
    if (useCustomDate && customDate) {
      return customDate;
    }
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
      console.error('Error reactivating proposal:', error);
      alert('Failed to reactivate proposal. Please try again.');
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
            <h2 className="text-xl font-bold text-gray-900">Reactivate Proposal {proposalNumber}</h2>
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
                  Please review pricing and terms before reactivating to ensure they are still accurate.
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

          {/* New Expiration Date */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar size={20} />
              Set New Approval Window
            </h3>

            {/* Preset Options */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {presetOptions.map((option) => (
                <button
                  key={option.days}
                  onClick={() => {
                    setExpirationDays(option.days);
                    setUseCustomDate(false);
                  }}
                  className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                    expirationDays === option.days && !useCustomDate
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <button
                onClick={() => setUseCustomDate(true)}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  useCustomDate
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom Date Picker */}
            {useCustomDate && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Expiration Date
                </label>
                <input
                  type="date"
                  value={customDate ? customDate.split('T')[0] : ''}
                  onChange={(e) => setCustomDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Expiration Preview */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-blue-700">New expiration date:</div>
                <div className="text-sm font-semibold text-blue-900">{getFormattedExpirationDate()}</div>
              </div>
            </div>
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
              placeholder="Add any notes about this reactivation for internal tracking..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-xl flex justify-between gap-3">
          <button
            onClick={onReview}
            className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium transition-colors flex items-center gap-2"
          >
            <FileText size={18} />
            Review First
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReactivate}
              disabled={submitting}
              className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 font-medium transition-all flex items-center gap-2"
            >
              <RotateCcw size={18} />
              {submitting ? 'Reactivating...' : 'Reactivate Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
