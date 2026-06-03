import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, DollarSign, Calendar, User, FileText, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Cancellation {
  id: string;
  contract_id: string;
  contact_id: string;
  cancellation_reason: string;
  custom_reason: string | null;
  requested_end_date: string;
  contract_end_date: string;
  months_remaining: number;
  monthly_rate: number;
  buyout_amount: number;
  is_early_termination: boolean;
  status: string;
  notes: string | null;
  created_at: string;
  contract: {
    contract_number: string;
    monthly_rate: number;
  };
  contact: {
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
  };
}

export function ContractCancellationQueue() {
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed'>('pending');
  const [selectedCancellation, setSelectedCancellation] = useState<Cancellation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadCancellations();
  }, [filter]);

  async function loadCancellations() {
    try {
      let query = supabase
        .from('security_contract_cancellations')
        .select(`
          *,
          contract:security_contracts(contract_number, monthly_rate),
          contact:contacts(first_name, last_name, full_name, email, phone)
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setCancellations(data || []);
    } catch (error) {
      console.error('Error loading cancellations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateCancellationStatus(id: string, status: string) {
    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('security_contract_cancellations')
        .update({
          status,
          notes: notes || null,
          processed_by: user.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      if (status === 'completed') {
        const cancellation = cancellations.find(c => c.id === id);
        if (cancellation) {
          await supabase
            .from('security_contracts')
            .update({
              status: 'cancelled',
              cancellation_requested_at: new Date().toISOString(),
              final_billing_date: cancellation.requested_end_date,
              cancellation_reason: cancellation.cancellation_reason,
            })
            .eq('id', cancellation.contract_id);
        }
      }

      setSelectedCancellation(null);
      setNotes('');
      loadCancellations();
    } catch (error) {
      console.error('Error updating cancellation:', error);
      alert('Failed to update cancellation status');
    } finally {
      setProcessing(false);
    }
  }

  const reasonLabels: Record<string, string> = {
    found_better_company: 'Found a company I like better',
    moving: "I'm moving",
    not_using_enough: "I don't use it enough",
    found_better_price: 'Found a better price',
    financial_reasons: 'Financial reasons',
    switching_to_self_monitoring: 'Switching to self-monitoring',
    other: 'Other',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Contract Cancellation Requests</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'pending'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'approved'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'completed'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {cancellations.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No cancellation requests found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {cancellations.map((cancellation) => (
            <div key={cancellation.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      {cancellation.contract.contract_number}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        cancellation.status === 'pending'
                          ? 'bg-yellow-900 text-yellow-200'
                          : cancellation.status === 'approved'
                          ? 'bg-blue-900 text-blue-200'
                          : cancellation.status === 'completed'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {cancellation.status.toUpperCase()}
                    </span>
                    {cancellation.is_early_termination && (
                      <span className="px-3 py-1 bg-orange-900 text-orange-200 rounded-full text-xs font-semibold">
                        EARLY TERMINATION
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <User className="w-4 h-4" />
                    <span>{cancellation.contact.full_name}</span>
                    <span>•</span>
                    <span>{cancellation.contact.email}</span>
                    <span>•</span>
                    <span>{cancellation.contact.phone}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCancellation(cancellation)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Review
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Reason</p>
                  <p className="text-sm text-white font-medium">
                    {reasonLabels[cancellation.cancellation_reason] || cancellation.cancellation_reason}
                  </p>
                  {cancellation.custom_reason && (
                    <p className="text-xs text-gray-400 mt-1">{cancellation.custom_reason}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Requested End Date</p>
                  <p className="text-sm text-white font-medium">
                    {new Date(cancellation.requested_end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Months Remaining</p>
                  <p className="text-sm text-white font-medium">{cancellation.months_remaining}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Buyout Amount</p>
                  <p className="text-sm text-white font-medium">
                    {cancellation.buyout_amount > 0
                      ? `$${cancellation.buyout_amount.toFixed(2)}`
                      : 'None'}
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Submitted {new Date(cancellation.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCancellation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Review Cancellation Request</h3>
              <button
                onClick={() => {
                  setSelectedCancellation(null);
                  setNotes('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Contract Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Contract Number</p>
                    <p className="text-white font-medium">{selectedCancellation.contract.contract_number}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Monthly Rate</p>
                    <p className="text-white font-medium">${selectedCancellation.monthly_rate.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Contract End Date</p>
                    <p className="text-white font-medium">
                      {new Date(selectedCancellation.contract_end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Months Remaining</p>
                    <p className="text-white font-medium">{selectedCancellation.months_remaining}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Customer Information</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-gray-400">Name</p>
                    <p className="text-white">{selectedCancellation.contact.full_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Email</p>
                    <p className="text-white">{selectedCancellation.contact.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Phone</p>
                    <p className="text-white">{selectedCancellation.contact.phone}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Cancellation Details</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-gray-400">Reason</p>
                    <p className="text-white">
                      {reasonLabels[selectedCancellation.cancellation_reason] ||
                        selectedCancellation.cancellation_reason}
                    </p>
                    {selectedCancellation.custom_reason && (
                      <p className="text-gray-300 mt-1">{selectedCancellation.custom_reason}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-400">Requested End Date</p>
                    <p className="text-white">
                      {new Date(selectedCancellation.requested_end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {selectedCancellation.is_early_termination && (
                <div className="bg-orange-900 bg-opacity-20 border border-orange-600 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-orange-200 mb-2">Early Termination Fee Required</h4>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-orange-400" />
                        <span className="text-2xl font-bold text-orange-200">
                          {selectedCancellation.buyout_amount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-orange-300 mt-2">
                        Customer must pay {selectedCancellation.months_remaining} months at $
                        {selectedCancellation.monthly_rate.toFixed(2)}/month
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add notes about this cancellation request..."
                />
              </div>

              {selectedCancellation.status === 'pending' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => updateCancellationStatus(selectedCancellation.id, 'cancelled')}
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Reject Request
                  </button>
                  <button
                    onClick={() => updateCancellationStatus(selectedCancellation.id, 'approved')}
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    Approve Request
                  </button>
                </div>
              )}

              {selectedCancellation.status === 'approved' && (
                <button
                  onClick={() => updateCancellationStatus(selectedCancellation.id, 'completed')}
                  disabled={processing}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Mark as Completed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
