import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, MapPin, Check, X, CreditCard as Edit2, Navigation, User, Calendar, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { TripEstimator } from './TripEstimator';

interface TravelBonusRequest {
  id: string;
  technician_id: string;
  work_order_id: string;
  job_address: string;
  from_type: 'office' | 'previous_job' | null;
  from_address: string | null;
  total_distance_miles: number;
  eligible_miles: number;
  rate_per_mile: number;
  bonus_amount: number;
  calculation_method: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  adjusted_amount: number | null;
  created_at: string;
  technician: {
    full_name: string;
  };
  work_order: {
    title: string;
  };
  office: {
    office_name: string;
  };
}

export function TravelBonusQueue() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<TravelBonusRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel('travel-bonus-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'travel_bonus_requests'
      }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from('travel_bonus_requests')
        .select(`
          *,
          technician:profiles!technician_id(full_name),
          work_order:work_orders(title),
          office:company_offices!office_id(office_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading travel bonus requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    if (!profile) return;

    try {
      const { error } = await supabase
        .from('travel_bonus_requests')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    }
  }

  async function handleDeny(requestId: string) {
    const notes = prompt('Reason for denial:');
    if (!notes) return;

    if (!profile) return;

    try {
      const { error } = await supabase
        .from('travel_bonus_requests')
        .update({
          status: 'denied',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          approval_notes: notes
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error denying request:', error);
      alert('Failed to deny request');
    }
  }

  function startEditing(request: TravelBonusRequest) {
    setEditingId(request.id);
    setEditAmount(request.bonus_amount.toString());
    setEditNotes('');
  }

  async function saveAdjustment() {
    if (!editingId || !profile) return;

    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!editNotes.trim()) {
      alert('Please provide a reason for the adjustment');
      return;
    }

    try {
      const { error } = await supabase
        .from('travel_bonus_requests')
        .update({
          status: 'adjusted',
          adjusted_amount: amount,
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          approval_notes: editNotes
        })
        .eq('id', editingId);

      if (error) throw error;

      setEditingId(null);
      setEditAmount('');
      setEditNotes('');
      loadRequests();
    } catch (error) {
      console.error('Error saving adjustment:', error);
      alert('Failed to save adjustment');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'adjusted':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'paid':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  const filteredRequests = requests.filter(req => {
    if (statusFilter === 'all') return true;
    return req.status === statusFilter;
  });

  const statusCounts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length,
    adjusted: requests.filter(r => r.status === 'adjusted').length,
    paid: requests.filter(r => r.status === 'paid').length
  };

  const totalPending = requests
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.bonus_amount, 0);

  const totalApproved = requests
    .filter(r => r.status === 'approved' || r.status === 'adjusted')
    .reduce((sum, r) => sum + (r.adjusted_amount || r.bonus_amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading travel bonus requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Travel Bonus Management</h2>
        <p className="text-gray-300">Estimate trips and review technician travel bonuses</p>
      </div>

      <TripEstimator />

      <div className="border-t border-gray-700 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Travel Bonus Approval Queue</h3>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Approval</p>
              <p className="text-3xl font-bold text-orange-600">{statusCounts.pending}</p>
            </div>
            <DollarSign className="w-12 h-12 text-orange-600 opacity-20" />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Total: {formatCurrency(totalPending)}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-3xl font-bold text-green-600">{statusCounts.approved + statusCounts.adjusted}</p>
            </div>
            <Check className="w-12 h-12 text-green-600 opacity-20" />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Total: {formatCurrency(totalApproved)}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Denied</p>
              <p className="text-3xl font-bold text-red-600">{statusCounts.denied}</p>
            </div>
            <X className="w-12 h-12 text-red-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'adjusted', label: 'Adjusted' },
          { value: 'denied', label: 'Denied' },
          { value: 'paid', label: 'Paid' },
          { value: 'all', label: 'All' }
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              statusFilter === filter.value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {filter.label} ({statusCounts[filter.value as keyof typeof statusCounts]})
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No travel bonus requests found</p>
          </div>
        ) : (
          filteredRequests.map(request => (
            <div key={request.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <User className="w-5 h-5 text-gray-400" />
                    <h3 className="font-semibold text-gray-900">{request.technician?.full_name}</h3>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                      getStatusColor(request.status)
                    }`}>
                      {request.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="space-y-2 text-sm">
                      {/* Route: origin → destination */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                          {request.from_type === 'previous_job' ? (
                            <Navigation className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <Building2 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-700">From</span>
                              {request.from_type === 'previous_job' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                  Previous Job
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                                  Office
                                </span>
                              )}
                            </div>
                            <div className="text-gray-600 text-xs mt-0.5">
                              {request.from_address || request.office?.office_name || 'Home Office'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pl-2">
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-gray-700">To</div>
                            <div className="text-gray-600 text-xs mt-0.5">{request.job_address}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-gray-400" />
                        <div>
                          <span className="font-medium text-gray-700">Work Order:</span>
                          <span className="text-gray-600 ml-2">{request.work_order?.title}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <span className="font-medium text-gray-700">Date:</span>
                          <span className="text-gray-600 ml-2">
                            {new Date(request.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Distance:</span>
                        <span className="font-semibold text-gray-900">
                          {request.total_distance_miles.toFixed(2)} mi
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Eligible Miles:</span>
                        <span className="font-semibold text-gray-900">
                          {request.eligible_miles.toFixed(2)} mi
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rate:</span>
                        <span className="font-semibold text-gray-900">
                          ${request.rate_per_mile.toFixed(2)}/mi
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Method:</span>
                        <span className="font-semibold text-gray-900 capitalize">
                          {request.calculation_method.replace('_', ' ')}
                          {request.from_type === 'previous_job' && (
                            <span className="text-xs text-amber-600 ml-1">(job-to-job)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-200">
                        <span className="font-medium text-gray-900">Bonus Amount:</span>
                        <span className="text-2xl font-bold text-green-600">
                          {formatCurrency(request.adjusted_amount || request.bonus_amount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {request.approval_notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
                      <strong className="text-gray-700">Notes:</strong>
                      <p className="text-gray-300">{request.approval_notes}</p>
                    </div>
                  )}

                  {editingId === request.id && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Adjusted Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Enter adjusted amount"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reason for Adjustment
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={2}
                          placeholder="Explain why you're adjusting this amount..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveAdjustment}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Save Adjustment
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditAmount('');
                            setEditNotes('');
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {request.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => startEditing(request)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Adjust Amount"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                      title="Approve"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeny(request.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Deny"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
