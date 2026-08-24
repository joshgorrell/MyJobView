import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, Plus, User, TrendingUp, Settings, AlertTriangle, Zap } from 'lucide-react';
import { useToast } from '../Shared/Toast';

interface PTOPolicy {
  id: string;
  policy_name: string;
  pto_type: string;
  accrual_method: string;
  accrual_rate: number;
  accrual_frequency: string | null;
  max_accrual_hours: number | null;
  max_carryover_hours: number | null;
  is_active: boolean;
}

interface PTORequest {
  id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  reason: string | null;
  status: string;
  submitted_at: string;
  is_same_day_callin: boolean | null;
  points_deducted: number | null;
  override_advance_notice: boolean | null;
  override_reason: string | null;
  employee: {
    id: string;
    full_name: string;
  };
  policy: {
    policy_name: string;
    pto_type: string;
  };
}

interface EmployeeBalance {
  id: string;
  current_balance_hours: number;
  pending_hours: number;
  used_hours_ytd: number;
  accrued_hours_ytd: number;
  employee: {
    id: string;
    full_name: string;
    employment_type: string;
  };
  policy: {
    policy_name: string;
    pto_type: string;
  };
}

export function PTOManagement() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'requests' | 'balances' | 'policies'>('requests');
  const [requests, setRequests] = useState<PTORequest[]>([]);
  const [balances, setBalances] = useState<EmployeeBalance[]>([]);
  const [policies, setPolicies] = useState<PTOPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('pto-management-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pto_requests'
      }, () => {
        loadData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pto_balances'
      }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [activeTab, filterStatus]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'requests') {
        await loadRequests();
      } else if (activeTab === 'balances') {
        await loadBalances();
      } else if (activeTab === 'policies') {
        await loadPolicies();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    try {
      let query = supabase
        .from('pto_requests')
        .select(`
          *,
          employee:profiles!employee_id(id, full_name),
          policy:pto_policies!policy_id(policy_name, pto_type)
        `)
        .order('submitted_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  }

  async function loadBalances() {
    try {
      const { data, error } = await supabase
        .from('pto_balances')
        .select(`
          *,
          employee:profiles!employee_id(id, full_name, employment_type),
          policy:pto_policies!policy_id(policy_name, pto_type)
        `)
        .order('current_balance_hours', { ascending: false });

      if (error) throw error;
      setBalances(data || []);
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  }

  async function loadPolicies() {
    try {
      const { data, error } = await supabase
        .from('pto_policies')
        .select('*')
        .order('policy_name');

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error('Error loading policies:', error);
    }
  }

  async function handleRequestAction(requestId: string, action: 'approve' | 'deny', notes?: string, overrideAdvance?: boolean) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const updateData: Record<string, unknown> = {
        status: action === 'approve' ? 'approved' : 'denied',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null
      };

      if (overrideAdvance) {
        updateData.override_advance_notice = true;
        updateData.override_reason = notes || 'Manager override';
      }

      const { error } = await supabase
        .from('pto_requests')
        .update(updateData)
        .eq('id', requestId);

      if (error) throw error;

      toast.success(`Request ${action === 'approve' ? 'approved' : 'denied'} successfully`);
      loadRequests();
    } catch (error: any) {
      console.error('Error updating request:', error);
      toast.error(error.message || 'Failed to update request');
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

  const filteredRequests = requests.filter(req =>
    req.employee.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBalances = balances.filter(bal =>
    bal.employee.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading PTO management...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Time Off Management</h2>
        <p className="text-gray-300">Manage PTO policies, requests, and employee balances</p>
      </div>

      {/* Tabs */}
      <div className="bg-gray-800 rounded-lg p-1 flex gap-1">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'requests'
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Calendar className="w-5 h-5" />
            Requests
          </div>
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'balances'
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5" />
            Balances
          </div>
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'policies'
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Settings className="w-5 h-5" />
            Policies
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {activeTab === 'requests' && (
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Employee</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Dates</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Hours</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Submitted</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No requests found
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map(request => (
                    <tr key={request.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{request.employee.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{request.policy.policy_name}</div>
                        <div className="text-xs text-gray-500 capitalize">{request.policy.pto_type.replace('_', ' ')}</div>
                        {request.is_same_day_callin && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                            <AlertTriangle className="w-3 h-3" />
                            Same-day call-in
                          </span>
                        )}
                        {request.points_deducted != null && request.points_deducted > 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 ml-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                            <Zap className="w-3 h-3" />
                            -{request.points_deducted} pts
                          </span>
                        )}
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
                      <td className="px-4 py-3">
                        {request.status === 'pending' && (
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRequestAction(request.id, 'approve')}
                                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRequestAction(request.id, 'deny')}
                                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                              >
                                Deny
                              </button>
                            </div>
                            {request.policy.pto_type === 'vacation' && (
                              <button
                                onClick={() => {
                                  const reason = window.prompt('Enter override reason for approving vacation with less than 14 days notice:');
                                  if (reason) handleRequestAction(request.id, 'approve', reason, true);
                                }}
                                className="px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
                              >
                                Override 14-day rule
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Balances Tab */}
      {activeTab === 'balances' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Employee</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Policy</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Available</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Pending</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Used YTD</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Accrued YTD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No balances found
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map(balance => (
                    <tr key={balance.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="font-medium text-gray-900">{balance.employee.full_name}</div>
                            <div className="text-xs text-gray-500 capitalize">{balance.employee.employment_type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{balance.policy.policy_name}</div>
                        <div className="text-xs text-gray-500 capitalize">{balance.policy.pto_type.replace('_', ' ')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-lg font-semibold text-blue-600">
                          {balance.current_balance_hours.toFixed(1)} hrs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {balance.pending_hours.toFixed(1)} hrs
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {balance.used_hours_ytd.toFixed(1)} hrs
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm text-gray-700">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          {balance.accrued_hours_ytd.toFixed(1)} hrs
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map(policy => (
            <div key={policy.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{policy.policy_name}</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  policy.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {policy.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium text-gray-900 capitalize">{policy.pto_type.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Accrual Method:</span>
                  <span className="font-medium text-gray-900 capitalize">{policy.accrual_method.replace('_', ' ')}</span>
                </div>
                {policy.accrual_method !== 'none' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Accrual Rate:</span>
                      <span className="font-medium text-gray-900">{policy.accrual_rate} hrs</span>
                    </div>
                    {policy.accrual_frequency && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Frequency:</span>
                        <span className="font-medium text-gray-900 capitalize">{policy.accrual_frequency}</span>
                      </div>
                    )}
                    {policy.max_accrual_hours && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max Accrual:</span>
                        <span className="font-medium text-gray-900">{policy.max_accrual_hours} hrs</span>
                      </div>
                    )}
                    {policy.max_carryover_hours && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max Carryover:</span>
                        <span className="font-medium text-gray-900">{policy.max_carryover_hours} hrs</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
