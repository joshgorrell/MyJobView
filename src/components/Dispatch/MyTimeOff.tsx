import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Clock, Plus, X, CheckCircle, XCircle, AlertCircle, TrendingUp, AlertTriangle } from 'lucide-react';

interface PTOBalance {
  id: string;
  current_balance_hours: number;
  pending_hours: number;
  used_hours_ytd: number;
  accrued_hours_ytd: number;
  policy: {
    id: string;
    policy_name: string;
    pto_type: string;
    is_paid: boolean;
  };
}

interface PTORequest {
  id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  reason: string | null;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  policy: {
    policy_name: string;
    pto_type: string;
  };
  reviewer: {
    full_name: string;
  } | null;
}

export function MyTimeOff() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<PTOBalance[]>([]);
  const [requests, setRequests] = useState<PTORequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [requestType, setRequestType] = useState<string>('full_day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('8');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ptoSettings, setPtoSettings] = useState({ vacation_advance_days: 14, same_day_callin_cutoff_time: '07:00', same_day_callin_points_loss: 10 });
  const [sameDayWarning, setSameDayWarning] = useState<string | null>(null);
  const [vacationWarning, setVacationWarning] = useState<string | null>(null);

  useEffect(() => {
    loadBalances();
    loadRequests();
    loadPtoSettings();

    const channel = supabase
      .channel('my-pto-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pto_balances'
      }, () => {
        loadBalances();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pto_requests'
      }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  async function loadPtoSettings() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('pto_vacation_advance_days, pto_same_day_callin_cutoff_time, pto_same_day_callin_points_loss')
        .maybeSingle();
      if (data) {
        setPtoSettings({
          vacation_advance_days: data.pto_vacation_advance_days ?? 14,
          same_day_callin_cutoff_time: (data.pto_same_day_callin_cutoff_time ?? '07:00:00').slice(0, 5),
          same_day_callin_points_loss: data.pto_same_day_callin_points_loss ?? 10,
        });
      }
    } catch (error) {
      console.error('Error loading PTO settings:', error);
    }
  }

  function getSelectedPolicyType(): string | undefined {
    const bal = balances.find(b => b.policy.id === selectedPolicy);
    return bal?.policy.pto_type;
  }

  function checkSameDayWarning() {
    if (!startDate) { setSameDayWarning(null); return; }
    const today = new Date().toISOString().slice(0, 10);
    const policyType = getSelectedPolicyType();
    if (startDate === today && policyType && !['bereavement', 'jury_duty', 'unpaid'].includes(policyType)) {
      const nowTime = new Date().toTimeString().slice(0, 5);
      if (nowTime > ptoSettings.same_day_callin_cutoff_time) {
        setSameDayWarning(`Calling in for today after ${ptoSettings.same_day_callin_cutoff_time} will deduct ${ptoSettings.same_day_callin_points_loss} points from your rewards balance.`);
      } else {
        setSameDayWarning(null);
      }
    } else {
      setSameDayWarning(null);
    }
  }

  function checkVacationWarning() {
    const policyType = getSelectedPolicyType();
    if (policyType !== 'vacation' || !startDate) { setVacationWarning(null); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < ptoSettings.vacation_advance_days) {
      setVacationWarning(`Vacation requests must be submitted at least ${ptoSettings.vacation_advance_days} days in advance. Your manager can override this, but the request may be denied.`);
    } else {
      setVacationWarning(null);
    }
  }

  async function loadBalances() {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('pto_balances')
        .select(`
          *,
          policy:pto_policies!policy_id(id, policy_name, pto_type, is_paid)
        `)
        .eq('employee_id', user.id);

      if (error) throw error;
      setBalances(data || []);
    } catch (error) {
      console.error('Error loading balances:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('pto_requests')
        .select(`
          *,
          policy:pto_policies!policy_id(policy_name, pto_type),
          reviewer:profiles!reviewed_by(full_name)
        `)
        .eq('employee_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  }

  async function submitRequest() {
    if (!user?.id || !selectedPolicy || !startDate || !endDate) {
      alert('Please fill in all required fields');
      return;
    }

    const policyType = getSelectedPolicyType();

    // Enforce 14-day advance notice for vacation
    if (policyType === 'vacation') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < ptoSettings.vacation_advance_days) {
        alert(`Vacation requests must be submitted at least ${ptoSettings.vacation_advance_days} days in advance. Please contact your manager if you need an exception.`);
        return;
      }
    }

    // Confirm same-day call-in points deduction
    if (sameDayWarning) {
      const confirmed = window.confirm(`${sameDayWarning}\n\nDo you want to proceed?`);
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      let totalHours = parseFloat(hours);

      if (requestType === 'full_day' || requestType === 'half_day') {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        totalHours = requestType === 'full_day' ? days * 8 : days * 4;
      }

      const { error } = await supabase
        .from('pto_requests')
        .insert({
          employee_id: user.id,
          policy_id: selectedPolicy,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          total_hours: totalHours,
          reason: reason || null
        });

      if (error) throw error;

      alert('Time off request submitted successfully!');
      setShowRequestForm(false);
      setSelectedPolicy('');
      setStartDate('');
      setEndDate('');
      setReason('');
      loadRequests();
      loadBalances();
    } catch (error: any) {
      console.error('Error submitting request:', error);
      alert(error.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'denied':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-gray-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading your time off information...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">My Time Off</h2>
          <p className="text-sm sm:text-base text-gray-300">Request time off and view your balances</p>
        </div>
        <button
          onClick={() => setShowRequestForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Request Time Off</span>
          <span className="sm:hidden">Request Time Off</span>
        </button>
      </div>

      {/* PTO Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {balances.map(balance => (
          <div key={balance.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{balance.policy.policy_name}</h3>
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-blue-600">
                  {balance.current_balance_hours.toFixed(1)} hrs
                </div>
                <div className="text-xs sm:text-sm text-gray-500">Available</div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-3 border-t border-gray-200">
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700">{balance.pending_hours.toFixed(1)} hrs</div>
                  <div className="text-xs text-gray-500">Pending</div>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700">{balance.used_hours_ytd.toFixed(1)} hrs</div>
                  <div className="text-xs text-gray-500">Used YTD</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 pt-2">
                <TrendingUp className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Accrued {balance.accrued_hours_ytd.toFixed(1)} hrs this year</span>
              </div>
            </div>
          </div>
        ))}
        {balances.length === 0 && (
          <div className="col-span-full text-center py-8 text-sm sm:text-base text-gray-500">
            No PTO balances found. Contact your administrator.
          </div>
        )}
      </div>

      {/* Request History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Request History</h3>
        </div>

        {/* Mobile Card Layout */}
        <div className="md:hidden divide-y divide-gray-200">
          {requests.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No time off requests yet
            </div>
          ) : (
            requests.map(request => (
              <div key={request.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{request.policy.policy_name}</div>
                    <div className="text-xs text-gray-500 capitalize">{request.policy.pto_type.replace('_', ' ')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(request.status)}
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Dates</div>
                    <div className="text-gray-700">
                      {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Hours</div>
                    <div className="font-semibold text-gray-900">{request.total_hours} hrs</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Submitted</div>
                    <div className="text-gray-700">{new Date(request.submitted_at).toLocaleDateString()}</div>
                  </div>
                  {request.reason && (
                    <div className="col-span-2">
                      <div className="text-xs text-gray-500 mb-1">Notes</div>
                      <div className="text-gray-600">{request.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Dates</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Hours</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Submitted</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No time off requests yet
                  </td>
                </tr>
              ) : (
                requests.map(request => (
                  <tr key={request.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{request.policy.policy_name}</div>
                      <div className="text-xs text-gray-500 capitalize">{request.policy.pto_type.replace('_', ' ')}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {request.total_hours} hrs
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(request.status)}
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(request.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {request.reason || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Form Modal */}
      {showRequestForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Request Time Off</h3>
              <button
                onClick={() => setShowRequestForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Off Type *
                </label>
                <select
                  value={selectedPolicy}
                  onChange={(e) => { setSelectedPolicy(e.target.value); setTimeout(() => { checkSameDayWarning(); checkVacationWarning(); }, 50); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select type...</option>
                  {balances.map(balance => (
                    <option key={balance.id} value={balance.policy.id}>
                      {balance.policy.policy_name} ({balance.current_balance_hours.toFixed(1)} hrs available)
                    </option>
                  ))}
                </select>
              </div>

              {vacationWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-amber-800">{vacationWarning}</span>
                </div>
              )}

              {sameDayWarning && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-800">{sameDayWarning}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Request Type *
                </label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="full_day">Full Day(s)</option>
                  <option value="half_day">Half Day(s)</option>
                  <option value="hours">Specific Hours</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setTimeout(() => { checkSameDayWarning(); checkVacationWarning(); }, 50); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {requestType === 'hours' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Provide additional context for your request..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowRequestForm(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={submitRequest}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
