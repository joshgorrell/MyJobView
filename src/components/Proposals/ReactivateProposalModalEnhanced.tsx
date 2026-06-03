import { useState, useEffect } from 'react';
import { RotateCcw, AlertTriangle, Calendar, Globe, FileText, X, CheckCircle, TrendingUp, TrendingDown, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ProposalPricingAnalysis } from '../../lib/types';

interface ReactivateProposalModalEnhancedProps {
  proposalId: string;
  proposalNumber: string;
  lastModified: string;
  totalAmount: number;
  onClose: () => void;
  onSuccess: () => void;
  onReview: () => void;
}

export function ReactivateProposalModalEnhanced({
  proposalId,
  proposalNumber,
  lastModified,
  totalAmount,
  onClose,
  onSuccess,
  onReview
}: ReactivateProposalModalEnhancedProps) {
  const [makePortalVisible, setMakePortalVisible] = useState(true);
  const [expirationDays, setExpirationDays] = useState(30);
  const [customDate, setCustomDate] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatePricing, setUpdatePricing] = useState(true);
  const [convertDiscontinued, setConvertDiscontinued] = useState(false);
  const [newStatus, setNewStatus] = useState<'designing' | 'sent'>('designing');
  const [pricingAnalysis, setPricingAnalysis] = useState<ProposalPricingAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [showDiscontinued, setShowDiscontinued] = useState(true);
  const [showPricingChanged, setShowPricingChanged] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const presetOptions = [
    { days: 7, label: '7 Days' },
    { days: 14, label: '14 Days' },
    { days: 30, label: '30 Days' },
    { days: 60, label: '60 Days' },
    { days: 90, label: '90 Days' },
  ];

  useEffect(() => {
    analyzePricing();
  }, []);

  async function analyzePricing() {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase
        .rpc('analyze_proposal_pricing', { p_proposal_id: proposalId });

      if (error) throw error;

      setPricingAnalysis(data as ProposalPricingAnalysis);

      // Auto-check update pricing if there are changes
      if (data && data.summary.has_pricing_changes) {
        setUpdatePricing(true);
      }
    } catch (error) {
      console.error('Error analyzing pricing:', error);
      alert('Failed to analyze pricing. You can still reactivate the proposal.');
    } finally {
      setAnalyzing(false);
    }
  }

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
      return { text: `${diffDays} days`, color: 'green' };
    } else if (diffDays < 90) {
      const months = Math.floor(diffDays / 30);
      return { text: `${months} ${months === 1 ? 'month' : 'months'}`, color: 'yellow' };
    } else {
      const months = Math.floor(diffDays / 30);
      return { text: `${months} months`, color: 'red' };
    }
  }

  async function handleReactivate() {
    setSubmitting(true);
    try {
      // Update proposal pricing if requested
      if (updatePricing && pricingAnalysis && pricingAnalysis.summary.has_pricing_changes) {
        const { error: pricingError } = await supabase
          .rpc('update_proposal_pricing', {
            p_proposal_id: proposalId,
            p_update_pricing: true,
            p_convert_discontinued_to_custom: convertDiscontinued
          });

        if (pricingError) throw pricingError;
      }

      const expiresAt = newStatus === 'sent' ? calculateExpirationDate() : null;

      const { error } = await supabase
        .from('proposals')
        .update({
          status: newStatus,
          sent_at: newStatus === 'sent' ? new Date().toISOString() : null,
          expires_at: expiresAt,
          is_portal_visible: makePortalVisible,
          archived_at: null,
          archived_by: null,
          auto_archived: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      if (error) throw error;

      // Add to activity log
      const activityNote = updatePricing ? 'Reactivated with updated pricing' : 'Reactivated with original pricing';
      await supabase.from('proposal_activity').insert({
        proposal_id: proposalId,
        activity_type: 'reactivated',
        metadata: {
          notes: notes.trim() || activityNote,
          pricing_updated: updatePricing,
          discontinued_converted: convertDiscontinued
        }
      });

      onSuccess();
    } catch (error) {
      console.error('Error reactivating proposal:', error);
      alert('Failed to reactivate proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const ageInfo = getDaysOld();
  const ageColor = ageInfo.color === 'green' ? 'green' : ageInfo.color === 'yellow' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <RotateCcw size={20} className="text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Reactivate Archived Proposal {proposalNumber}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Age Warning Banner */}
          <div className={`bg-${ageColor}-50 border-l-4 border-${ageColor}-500 rounded-lg p-4`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className={`text-${ageColor}-600 mt-0.5`} />
              <div>
                <p className={`font-semibold text-${ageColor}-900 mb-1`}>
                  This proposal is {ageInfo.text} old
                </p>
                <p className={`text-sm text-${ageColor}-800`}>
                  {ageInfo.color === 'red'
                    ? 'Important: Pricing and product availability should be reviewed carefully before reactivating.'
                    : 'Please review pricing and terms before reactivating to ensure they are still accurate.'}
                </p>
              </div>
            </div>
          </div>

          {/* Pricing Analysis Section */}
          {analyzing ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-sm text-gray-600">Analyzing pricing and product availability...</p>
            </div>
          ) : pricingAnalysis && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Pricing Analysis</h3>

              {/* Discontinued Products Section */}
              {pricingAnalysis.discontinued_items.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowDiscontinued(!showDiscontinued)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <XCircle size={20} className="text-red-600" />
                      <div className="text-left">
                        <p className="font-semibold text-red-900">
                          {pricingAnalysis.discontinued_items.length} Discontinued Products Found
                        </p>
                        <p className="text-sm text-red-700">These products are no longer available in your catalog</p>
                      </div>
                    </div>
                    {showDiscontinued ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {showDiscontinued && (
                    <div className="px-4 pb-4 space-y-2">
                      {pricingAnalysis.discontinued_items.map((item) => (
                        <div key={item.line_item_id} className="bg-white rounded p-3 text-sm">
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          <p className="text-gray-600">
                            Qty: {item.quantity} @ ${item.unit_price.toFixed(2)} = ${item.line_total.toFixed(2)}
                          </p>
                        </div>
                      ))}
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={convertDiscontinued}
                            onChange={(e) => setConvertDiscontinued(e.target.checked)}
                            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <div>
                            <p className="font-medium text-gray-900">Convert to custom items</p>
                            <p className="text-xs text-gray-600">Preserve these items with current pricing as custom line items</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing Changed Section */}
              {pricingAnalysis.pricing_changed_items.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowPricingChanged(!showPricingChanged)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {pricingAnalysis.summary.difference >= 0 ? (
                        <TrendingUp size={20} className="text-amber-600" />
                      ) : (
                        <TrendingDown size={20} className="text-amber-600" />
                      )}
                      <div className="text-left">
                        <p className="font-semibold text-amber-900">
                          {pricingAnalysis.pricing_changed_items.length} Items Have Pricing Updates
                        </p>
                        <p className="text-sm text-amber-700">
                          Total difference: {pricingAnalysis.summary.difference >= 0 ? '+' : ''}
                          ${pricingAnalysis.summary.difference.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {showPricingChanged ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {showPricingChanged && (
                    <div className="px-4 pb-4 space-y-2">
                      {pricingAnalysis.pricing_changed_items.map((item) => (
                        <div key={item.line_item_id} className="bg-white rounded p-3 text-sm">
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          <div className="grid grid-cols-3 gap-4 mt-2 text-xs">
                            <div>
                              <p className="text-gray-500">Old Price</p>
                              <p className="font-medium">${item.old_unit_price.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">New Price</p>
                              <p className="font-medium">${item.new_unit_price.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Line Difference</p>
                              <p className={`font-medium ${item.line_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {item.line_difference >= 0 ? '+' : ''}${item.line_difference.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pricing Unchanged Section */}
              {pricingAnalysis.pricing_unchanged_items.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowUnchanged(!showUnchanged)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-green-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle size={20} className="text-green-600" />
                      <div className="text-left">
                        <p className="font-semibold text-green-900">
                          {pricingAnalysis.pricing_unchanged_items.length} Items Have Current Pricing
                        </p>
                        <p className="text-sm text-green-700">These items don't require updates</p>
                      </div>
                    </div>
                    {showUnchanged ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              )}

              {/* Update Pricing Option */}
              {pricingAnalysis.pricing_changed_items.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updatePricing}
                      onChange={(e) => setUpdatePricing(e.target.checked)}
                      className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 mb-1">Update all pricing to current catalog prices</p>
                      <p className="text-sm text-blue-700 mb-3">
                        This will update {pricingAnalysis.pricing_changed_items.length} items to current pricing
                      </p>
                      {updatePricing && (
                        <div className="grid grid-cols-3 gap-4 text-sm bg-white rounded p-3">
                          <div>
                            <p className="text-gray-600">Original Total</p>
                            <p className="font-semibold text-gray-900">${pricingAnalysis.summary.old_total.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">New Total</p>
                            <p className="font-semibold text-gray-900">${pricingAnalysis.summary.new_total.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Difference</p>
                            <p className={`font-semibold ${pricingAnalysis.summary.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {pricingAnalysis.summary.difference >= 0 ? '+' : ''}${pricingAnalysis.summary.difference.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Reactivation Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Reactivation Settings</h3>

            {/* Status Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Status
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setNewStatus('designing')}
                  className={`px-4 py-3 rounded-lg border-2 font-medium transition-all text-left ${
                    newStatus === 'designing'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold">Designing</p>
                  <p className="text-xs mt-1">Review before sending</p>
                </button>
                <button
                  onClick={() => setNewStatus('sent')}
                  className={`px-4 py-3 rounded-lg border-2 font-medium transition-all text-left ${
                    newStatus === 'sent'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold">Sent</p>
                  <p className="text-xs mt-1">Ready for customer</p>
                </button>
              </div>
            </div>

            {newStatus === 'sent' && (
              <>
                {/* Portal Visibility */}
                <div className="mb-4">
                  <label className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={makePortalVisible}
                      onChange={(e) => setMakePortalVisible(e.target.checked)}
                      className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                        <Globe size={16} />
                        Make visible on customer portal
                      </div>
                      <div className="text-sm text-gray-600">
                        Customer can view and approve this proposal through their online portal
                      </div>
                    </div>
                  </label>
                </div>

                {/* Expiration Date */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar size={16} className="inline mr-1" />
                    Set Approval Window
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
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

                  {useCustomDate && (
                    <input
                      type="date"
                      value={customDate ? customDate.split('T')[0] : ''}
                      onChange={(e) => setCustomDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-700">Expires:</span>
                      <span className="font-semibold text-blue-900">{getFormattedExpirationDate()}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Optional Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText size={16} className="inline mr-1" />
                Internal Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this reactivation for internal tracking..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
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
              disabled={submitting || analyzing}
              className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 font-medium transition-all flex items-center gap-2"
            >
              <RotateCcw size={18} />
              {submitting ? 'Reactivating...' : 'Reactivate Proposal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
