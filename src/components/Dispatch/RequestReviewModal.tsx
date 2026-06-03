import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import { X, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface TimeRequest {
  id: string;
  daily_clock_entry_id: string;
  technician_id: string;
  current_clock_in: string;
  current_clock_out: string | null;
  requested_clock_in: string;
  requested_clock_out: string | null;
  reason_category: string;
  explanation: string;
  status: string;
  created_at: string;
  technician: {
    full_name: string;
  };
}

interface Props {
  entryId: string;
  onClose: () => void;
  onReviewed: () => void;
}

export function RequestReviewModal({ entryId, onClose, onReviewed }: Props) {
  const { profile } = useAuth();
  const [request, setRequest] = useState<TimeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    loadRequest();
  }, [entryId]);

  async function loadRequest() {
    try {
      const { data, error } = await supabase
        .from('time_adjustment_requests')
        .select(`
          *,
          technician:profiles!technician_id(full_name)
        `)
        .eq('daily_clock_entry_id', entryId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setRequest(data);
    } catch (error) {
      console.error('Error loading request:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!request) return;

    setProcessing(true);
    try {
      // Update the daily clock entry with requested times
      const { error: updateError } = await supabase
        .from('daily_clock_entries')
        .update({
          clock_in: request.requested_clock_in,
          clock_out: request.requested_clock_out,
          admin_adjusted: true,
          adjusted_by: profile?.id,
          adjustment_reason: `Time adjustment request approved - ${getCategoryLabel(request.reason_category)}`
        })
        .eq('id', request.daily_clock_entry_id);

      if (updateError) throw updateError;

      // Mark request as approved
      const { error: requestError } = await supabase
        .from('time_adjustment_requests')
        .update({
          status: 'approved',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null
        })
        .eq('id', request.id);

      if (requestError) throw requestError;

      alert('Time adjustment request approved successfully');
      onReviewed();
      onClose();
    } catch (error: any) {
      console.error('Error approving request:', error);
      alert(error.message || 'Failed to approve request');
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeny() {
    if (!request) return;

    if (!adminNotes.trim()) {
      alert('Please provide a reason for denial');
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('time_adjustment_requests')
        .update({
          status: 'denied',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes.trim()
        })
        .eq('id', request.id);

      if (error) throw error;

      alert('Time adjustment request denied');
      onReviewed();
      onClose();
    } catch (error: any) {
      console.error('Error denying request:', error);
      alert(error.message || 'Failed to deny request');
    } finally {
      setProcessing(false);
    }
  }

  function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      forgot_clock_in: 'Forgot to Clock In',
      forgot_clock_out: 'Forgot to Clock Out',
      wrong_time: 'Wrong Time Entered',
      system_error: 'System Error',
      other: 'Other'
    };
    return labels[category] || category;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6">
          <div className="text-gray-500">Loading request...</div>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Request</h3>
            <p className="text-gray-600 mb-4">There is no pending request for this entry.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-700 text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6" />
              <div>
                <h2 className="text-2xl font-bold">Review Time Adjustment Request</h2>
                <p className="text-orange-100 text-sm">
                  Submitted by {request.technician.full_name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Request Details</p>
                <div className="space-y-1">
                  <p><strong>Reason:</strong> {getCategoryLabel(request.reason_category)}</p>
                  <p><strong>Submitted:</strong> {new Date(request.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Technician's Explanation</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700 whitespace-pre-wrap">{request.explanation}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Current Times */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600" />
                Current Times
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Clock In</div>
                  <div className="text-lg font-mono font-medium text-gray-900">
                    {new Date(request.current_clock_in).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Clock Out</div>
                  <div className="text-lg font-mono font-medium text-gray-900">
                    {request.current_clock_out ? (
                      new Date(request.current_clock_out).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    ) : (
                      <span className="text-blue-600">Not clocked out</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Requested Times */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Requested Times
              </h3>
              <div className="bg-blue-50 rounded-lg p-4 space-y-3 border-2 border-blue-300">
                <div>
                  <div className="text-xs text-blue-700 mb-1">Clock In</div>
                  <div className="text-lg font-mono font-bold text-blue-900">
                    {new Date(request.requested_clock_in).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-700 mb-1">Clock Out</div>
                  <div className="text-lg font-mono font-bold text-blue-900">
                    {request.requested_clock_out ? (
                      new Date(request.requested_clock_out).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    ) : (
                      <span className="text-blue-600">Not clocked out</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Notes {adminNotes ? '' : '(Required for denial)'}
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about your decision (required if denying)..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setConfirmAction('deny')}
              disabled={processing}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              {processing ? 'Processing...' : 'Deny'}
            </button>
            <button
              onClick={() => setConfirmAction('approve')}
              disabled={processing}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              {processing ? 'Processing...' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmAction === 'approve'}
        title="Approve Request"
        message="Approve this time adjustment request?"
        variant="neutral"
        confirmLabel="Approve"
        onConfirm={() => {
          setConfirmAction(null);
          handleApprove();
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        isOpen={confirmAction === 'deny'}
        title="Deny Request"
        message="Deny this time adjustment request?"
        variant="danger"
        confirmLabel="Deny"
        onConfirm={() => {
          setConfirmAction(null);
          handleDeny();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
