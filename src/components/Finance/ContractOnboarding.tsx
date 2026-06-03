import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, CheckCircle, AlertCircle, FileText, Calendar, User, DollarSign, XCircle, MessageSquare, BarChart2, List } from 'lucide-react';
import SecurityContractDetail from './SecurityContractDetail';
import SecurityAccountStats from './SecurityAccountStats';
import ConfirmModal from '../ui/ConfirmModal';

interface Contract {
  id: string;
  contact: any;
  template: any;
  status: string;
  created_at: string;
  customer_completed_at: string;
  approved_at: string;
  activated_at: string;
  cancelled_at: string;
  cancellation_requested_at: string;
  cancellation_reason: string;
  cancelled_by_profile: { full_name: string; first_name: string; last_name: string } | null;
  monthly_price: number;
  notes: string;
}

interface StatusColumn {
  key: string;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

export default function ContractOnboarding() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [confirmApproveContract, setConfirmApproveContract] = useState<Contract | null>(null);
  const [activeTab, setActiveTab] = useState<'contracts' | 'stats'>('contracts');
  const [stats, setStats] = useState({
    totalCancelled: 0,
    cancelledThisMonth: 0,
    averageContractDuration: 0
  });

  const statusColumns: StatusColumn[] = [
    { key: 'pending_approval', label: 'Completed', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
    { key: 'active', label: 'Active', icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    { key: 'cancelled', label: 'Cancelled', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' }
  ];

  useEffect(() => {
    loadContracts();
    loadCancellationStats();

    const channel = supabase
      .channel('contract_management_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_contracts' }, () => {
        loadContracts();
        loadCancellationStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadContracts() {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          *,
          contact:contacts(*),
          template:security_contract_templates(*),
          cancelled_by_profile:profiles!cancelled_by_user_id(full_name, first_name, last_name)
        `)
        .in('status', ['pending_approval', 'active', 'cancelled'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCancellationStats() {
    try {
      const { data: cancelledContracts, error } = await supabase
        .from('security_contracts')
        .select('created_at, cancelled_at, activated_at')
        .eq('status', 'cancelled');

      if (error) throw error;

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const cancelledThisMonth = (cancelledContracts || []).filter(c =>
        c.cancelled_at && new Date(c.cancelled_at) >= firstOfMonth
      ).length;

      let totalDuration = 0;
      let count = 0;
      (cancelledContracts || []).forEach(c => {
        if (c.activated_at && c.cancelled_at) {
          const duration = new Date(c.cancelled_at).getTime() - new Date(c.activated_at).getTime();
          totalDuration += duration;
          count++;
        }
      });

      const averageDurationMs = count > 0 ? totalDuration / count : 0;
      const averageDurationMonths = averageDurationMs / (1000 * 60 * 60 * 24 * 30);

      setStats({
        totalCancelled: cancelledContracts?.length || 0,
        cancelledThisMonth,
        averageContractDuration: Math.round(averageDurationMonths * 10) / 10
      });
    } catch (error) {
      console.error('Error loading cancellation stats:', error);
    }
  }

  function getContractsByStatus(status: string) {
    return contracts.filter(c => {
      const matchesSearch = searchTerm === '' ||
        c.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contact?.email?.toLowerCase().includes(searchTerm.toLowerCase());

      return c.status === status && matchesSearch;
    });
  }

  async function handleApproveContract(contract: Contract) {
    try {
      const { error } = await supabase
        .from('security_contracts')
        .update({
          status: 'active',
          approved_at: new Date().toISOString(),
          activated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (error) throw error;

      alert('Contract approved and activated successfully!');
      loadContracts();
      loadCancellationStats();
    } catch (error) {
      console.error('Error approving contract:', error);
      alert('Failed to approve contract');
    }
  }

  function formatDate(dateString: string) {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDateTime(dateString: string) {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contracts...</p>
        </div>
      </div>
    );
  }

  if (selectedContract) {
    return (
      <SecurityContractDetail
        contract={selectedContract}
        onClose={() => setSelectedContract(null)}
        onUpdate={() => {
          setSelectedContract(null);
          loadContracts();
        }}
      />
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contract Management</h1>
          <p className="text-gray-300 mt-1">Track completed, active, and cancelled security contracts</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-white/10 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'contracts'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <List className="w-4 h-4" />
          Contracts
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'stats'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Account Stats
        </button>
      </div>

      {activeTab === 'stats' && <SecurityAccountStats />}

      {activeTab === 'contracts' && <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium mb-1">Total Cancelled</p>
              <p className="text-3xl font-bold text-red-900">{stats.totalCancelled}</p>
            </div>
            <XCircle className="w-10 h-10 text-red-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium mb-1">Cancelled This Month</p>
              <p className="text-3xl font-bold text-orange-900">{stats.cancelledThisMonth}</p>
            </div>
            <AlertCircle className="w-10 h-10 text-orange-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium mb-1">Avg Contract Duration</p>
              <p className="text-3xl font-bold text-purple-900">{stats.averageContractDuration} mo</p>
            </div>
            <Calendar className="w-10 h-10 text-purple-600 opacity-50" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by customer name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {statusColumns.map((column) => {
          const Icon = column.icon;
          const columnContracts = getContractsByStatus(column.key);

          return (
            <div key={column.key} className="flex flex-col">
              <div className={`${column.bgColor} ${column.borderColor} border-2 rounded-t-lg p-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-6 h-6 ${column.color}`} />
                    <h3 className={`font-bold text-lg ${column.color}`}>{column.label}</h3>
                  </div>
                  <span className={`${column.color} font-bold text-2xl`}>
                    {columnContracts.length}
                  </span>
                </div>
              </div>

              <div className={`flex-1 ${column.bgColor} ${column.borderColor} border-2 border-t-0 rounded-b-lg p-4 space-y-4 min-h-[600px]`}>
                {columnContracts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Icon className={`w-12 h-12 ${column.color} opacity-50 mx-auto mb-2`} />
                    <p className="font-medium">No contracts</p>
                  </div>
                ) : (
                  columnContracts.map((contract) => {
                    return (
                      <div
                        key={contract.id}
                        className="bg-white border-2 border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-lg transition-all"
                      >
                        <div className="flex items-start gap-4 mb-4">
                          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base text-gray-900 mb-1">
                              {contract.contact?.full_name || 'Unknown'}
                            </h4>
                            <p className="text-sm text-gray-600 break-words">
                              {contract.contact?.email || 'No email'}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2.5 mb-4">
                          <div className="flex items-start gap-2 text-sm text-gray-700">
                            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span className="font-medium break-words">{contract.template?.name || 'No template'}</span>
                          </div>

                          {contract.monthly_price && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <DollarSign className="w-4 h-4 flex-shrink-0" />
                              <span className="font-semibold">${contract.monthly_price.toFixed(2)}/month</span>
                            </div>
                          )}

                          {contract.customer_completed_at && (
                            <div className="flex items-center gap-2 text-sm text-green-600 font-semibold">
                              <CheckCircle className="w-4 h-4 flex-shrink-0" />
                              <span>Completed {formatDate(contract.customer_completed_at)}</span>
                            </div>
                          )}

                          {contract.activated_at && (
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                              <Calendar className="w-4 h-4 flex-shrink-0" />
                              <span>Activated {formatDate(contract.activated_at)}</span>
                            </div>
                          )}

                          {contract.status === 'cancelled' && contract.cancellation_requested_at && (
                            <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                              <div className="flex items-start gap-2 text-sm text-red-700 font-semibold">
                                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>{formatDateTime(contract.cancellation_requested_at)}</span>
                              </div>
                              {contract.cancelled_by_profile && (
                                <div className="flex items-center gap-2 text-sm text-red-600">
                                  <User className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>
                                    By{' '}
                                    <span className="font-semibold">
                                      {contract.cancelled_by_profile.full_name ||
                                        `${contract.cancelled_by_profile.first_name || ''} ${contract.cancelled_by_profile.last_name || ''}`.trim() ||
                                        'Unknown'}
                                    </span>
                                  </span>
                                </div>
                              )}
                              {contract.cancellation_reason && (
                                <div className="flex items-start gap-2 text-sm text-red-600">
                                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                  <span className="italic">{contract.cancellation_reason}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {contract.notes && (
                          <p className="text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded border border-gray-200 line-clamp-3">
                            {contract.notes}
                          </p>
                        )}

                        <div className="flex flex-col gap-2">
                          {contract.status === 'pending_approval' && (
                            <button
                              onClick={() => setConfirmApproveContract(contract)}
                              className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Approve & Activate
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedContract(contract)}
                            className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>}
      <ConfirmModal
        isOpen={confirmApproveContract !== null}
        title="Approve Contract"
        message="Approve this contract and activate recurring billing?"
        variant="neutral"
        confirmLabel="Approve & Activate"
        onConfirm={() => {
          if (confirmApproveContract) {
            handleApproveContract(confirmApproveContract);
          }
          setConfirmApproveContract(null);
        }}
        onCancel={() => setConfirmApproveContract(null)}
      />
    </div>
  );
}
