import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Plus, Clock, FileText, Send, Calendar, User, RotateCcw, Search, Trash2, AlertCircle, Eye, CreditCard as Edit2, ArrowRight, UserCheck, CheckCircle, XCircle, Loader2, Mail, X } from 'lucide-react';
import { BillingPrefBadge } from '../Shared/BillingPrefBadge';
import CreateSecurityContractModal from './CreateSecurityContractModal';
import SecurityContractDetail from './SecurityContractDetail';
import EditSecurityContractModal from './EditSecurityContractModal';
import ManualContractEntry from './ManualContractEntry';

interface Contract {
  id: string;
  contract_number: string;
  contact: any;
  template: any;
  created_at: string;
  status: string;
  invitation_sent_at: string;
  customer_completed_at: string;
  magic_link_expires_at: string;
  monthly_price: number;
  notes: string;
  pipelineStatus?: string;
  invitation_sent_by?: {
    id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
}

interface StatusColumn {
  key: string;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface SecurityOnboardingProps {
  onNavigateToContracts?: () => void;
  canAccessContractManagement?: boolean;
}

type DialogState =
  | { type: 'none' }
  | { type: 'confirm_send'; contract: Contract; isResend: boolean }
  | { type: 'confirm_delete'; contract: Contract }
  | { type: 'sending'; action: 'send' | 'delete' }
  | { type: 'success'; message: string; action: 'send' | 'delete' }
  | { type: 'error'; message: string };

function SendAgreementDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: DialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state.type === 'none') return null;

  const isVisible = state.type !== 'none';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 transition-all duration-300 ${
        isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
      }`}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          state.type !== 'sending'
        )
          onCancel();
      }}
    >
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
        }`}
      >
        {/* Sending/deleting state */}
        {state.type === 'sending' && (
          <div className="p-10 flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${state.action === 'delete' ? 'bg-red-50' : 'bg-blue-50'}`}>
                <Loader2 className={`w-10 h-10 animate-spin ${state.action === 'delete' ? 'text-red-500' : 'text-blue-600'}`} />
              </div>
              <div className={`absolute inset-0 rounded-full border-4 animate-ping opacity-30 ${state.action === 'delete' ? 'border-red-200' : 'border-blue-200'}`} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {state.action === 'delete' ? 'Deleting Agreement' : 'Sending Agreement'}
              </h3>
              <p className="text-sm text-gray-500">
                {state.action === 'delete' ? 'Permanently removing this agreement...' : 'Generating secure link and sending email...'}
              </p>
            </div>
          </div>
        )}

        {/* Success state */}
        {state.type === 'success' && (
          <div className="p-10 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center animate-[bounce_0.5s_ease-out]">
              <CheckCircle className="w-11 h-11 text-green-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {state.action === 'delete' ? 'Agreement Deleted' : 'Agreement Sent!'}
              </h3>
              <p className="text-sm text-gray-500">{state.message}</p>
            </div>
            <button
              onClick={onCancel}
              className="mt-2 px-8 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Error state */}
        {state.type === 'error' && (
          <div className="p-10 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle className="w-11 h-11 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Failed to Send</h3>
              <p className="text-sm text-gray-500">{state.message}</p>
            </div>
            <button
              onClick={onCancel}
              className="mt-2 px-8 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Confirm send state */}
        {state.type === 'confirm_send' && (
          <>
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    state.isResend ? 'bg-orange-50' : 'bg-blue-50'
                  }`}>
                    {state.isResend
                      ? <RotateCcw className="w-5 h-5 text-orange-500" />
                      : <Send className="w-5 h-5 text-blue-500" />
                    }
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {state.isResend ? 'Re-send Agreement' : 'Send Agreement'}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">Security Monitoring Contract</p>
                  </div>
                </div>
                <button
                  onClick={onCancel}
                  className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {state.contract.contact?.full_name || 'Unknown Customer'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-500 truncate">
                        {state.contract.contact?.email || 'No email'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-2.5 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400 mb-0.5">Template</p>
                    <p className="font-medium text-gray-700 truncate">
                      {state.contract.template?.name || 'N/A'}
                    </p>
                  </div>
                  {state.contract.monthly_price && (
                    <div>
                      <p className="text-gray-400 mb-0.5">Monthly Rate</p>
                      <p className="font-semibold text-gray-900">
                        ${parseFloat(String(state.contract.monthly_price)).toFixed(2)}/mo
                      </p>
                    </div>
                  )}
                </div>
                {state.contract.contact_id && (
                  <div className="border-t border-gray-200 pt-2.5 mt-2.5">
                    <p className="text-gray-400 mb-0.5 text-xs">Billing Preference</p>
                    <BillingPrefBadge contactId={state.contract.contact_id} />
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                {state.isResend
                  ? 'A new secure link will be generated and sent to the customer. The previous link will be invalidated.'
                  : 'A secure link will be emailed to the customer. The link will be valid for 30 days.'}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className={`flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 ${
                    state.isResend
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {state.isResend
                    ? <><RotateCcw className="w-4 h-4" /> Re-send</>
                    : <><Send className="w-4 h-4" /> Send Agreement</>
                  }
                </button>
              </div>
            </div>
          </>
        )}

        {/* Confirm delete state */}
        {state.type === 'confirm_delete' && (
          <>
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Delete Agreement</h3>
                    <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
                  </div>
                </div>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {state.contract.contact?.full_name || 'Unknown Customer'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {state.contract.contract_number}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                {state.contract.status === 'draft'
                  ? 'This draft agreement will be permanently deleted.'
                  : 'The customer will no longer be able to access their agreement link.'}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SecurityOnboarding({ onNavigateToContracts, canAccessContractManagement }: SecurityOnboardingProps = {}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);
  const [contractForManualEntry, setContractForManualEntry] = useState<Contract | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const mountedRef = React.useRef(true);

  const statusColumns: StatusColumn[] = [
    { key: 'pending', label: 'Pending', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
    { key: 'in_progress', label: 'In Progress', icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' }
  ];

  const realtimeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    loadContracts();

    const channelName = `security_onboarding_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_contracts' }, () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
          loadContracts(false);
        }, 1000);
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadContracts(showSpinner = true) {
    if (mountedRef.current && showSpinner) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          id, contract_number, status, created_at, invitation_sent_at,
          customer_completed_at, magic_link_expires_at, monthly_price, notes,
          contact:contacts(id, full_name, first_name, last_name, email, phone, company_name),
          template:security_contract_templates(id, name, description),
          invitation_sent_by:profiles!invitation_sent_by_user_id(id, full_name, first_name, last_name)
        `)
        .in('status', ['draft', 'pending_customer'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedContracts = (data || []).map(contract => {
        const isCompleted = !!contract.customer_completed_at;
        const hasInvitation = !!contract.invitation_sent_at;

        let pipelineStatus = 'pending';
        if (hasInvitation && !isCompleted && contract.status === 'pending_customer') {
          pipelineStatus = 'in_progress';
        }

        return { ...contract, pipelineStatus };
      });

      if (mountedRef.current) setContracts(processedContracts);
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function promptSendInvitation(contract: Contract, isResend = false) {
    if (!contract.contact || !contract.contact.email) {
      setDialog({
        type: 'error',
        message: 'Customer contact information is missing. Please ensure the agreement has a valid customer assigned.'
      });
      return;
    }
    setDialog({ type: 'confirm_send', contract, isResend });
  }

  async function executeSendInvitation(contract: Contract, isResend: boolean) {
    setDialog({ type: 'sending', action: 'send' });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDialog({ type: 'error', message: 'You must be logged in to send invitations.' });
        return;
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const magicToken = crypto.randomUUID();

      const updateData: any = {
        status: 'pending_customer',
        invitation_sent_at: new Date().toISOString(),
        invitation_sent_by_user_id: user.id,
        magic_link_token: magicToken,
        magic_link_expires_at: expiresAt.toISOString()
      };

      const { error: updateError } = await supabase
        .from('security_contracts')
        .update(updateData)
        .eq('id', contract.id);

      if (updateError) throw updateError;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contract-invitation`;
      const { data: { session } } = await supabase.auth.getSession();

      const fetchResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract.id,
          customerEmail: contract.contact.email,
          customerName: contract.contact.full_name || 'Customer',
          token: magicToken,
          appOrigin: window.location.origin
        })
      });

      const responseData = await fetchResponse.json();

      if (!fetchResponse.ok || !responseData.success) {
        const errorMsg = responseData.error || 'Unknown error occurred';
        throw new Error(errorMsg);
      }

      setDialog({
        type: 'success',
        action: 'send',
        message: isResend
          ? `Agreement re-sent to ${contract.contact?.full_name || 'customer'} successfully.`
          : `Agreement sent to ${contract.contact?.full_name || 'customer'}. Link expires in 30 days.`
      });
      loadContracts(false);
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      setDialog({
        type: 'error',
        message: error?.message || 'An unexpected error occurred. Please try again.'
      });
    }
  }

  function promptDelete(contract: Contract) {
    setDialog({ type: 'confirm_delete', contract });
  }

  async function executeDelete(contract: Contract) {
    setDialog({ type: 'sending', action: 'delete' });
    try {
      const { error } = await supabase
        .from('security_contracts')
        .delete()
        .eq('id', contract.id);

      if (error) throw error;

      setDialog({ type: 'success', action: 'delete', message: 'Agreement deleted successfully.' });
      loadContracts(false);
    } catch (error) {
      console.error('Error deleting contract:', error);
      setDialog({ type: 'error', message: 'Failed to delete agreement. Please try again.' });
    }
  }

  function handleDialogConfirm() {
    if (dialog.type === 'confirm_send') {
      executeSendInvitation(dialog.contract, dialog.isResend);
    } else if (dialog.type === 'confirm_delete') {
      executeDelete(dialog.contract);
    }
  }

  function handleDialogCancel() {
    setDialog({ type: 'none' });
  }

  function getContractsByStatus(status: string) {
    return contracts.filter(c => {
      const matchesSearch = searchTerm === '' ||
        c.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contact?.email?.toLowerCase().includes(searchTerm.toLowerCase());
      return c.pipelineStatus === status && matchesSearch;
    });
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

  function getDaysRemaining(expiresAt: string) {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffTime = expires.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function isExpired(expiresAt: string) {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agreements...</p>
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
          loadContracts(false);
        }}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Security Onboarding</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-300">Track pending and in-progress customer agreement onboarding</p>
          {onNavigateToContracts && canAccessContractManagement !== false && (
            <button
              onClick={onNavigateToContracts}
              className="flex items-center gap-2 mt-3 text-blue-400 hover:text-blue-300 transition-colors group"
            >
              <span className="text-sm font-medium">View All Agreements</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-sm sm:text-base font-medium whitespace-nowrap"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden xs:inline">Start New Agreement</span>
          <span className="xs:hidden">New Agreement</span>
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by customer name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {statusColumns.map((column) => {
          const Icon = column.icon;
          const columnContracts = getContractsByStatus(column.key);

          return (
            <div key={column.key} className="flex flex-col">
              <div className={`${column.bgColor} ${column.borderColor} border-2 rounded-t-lg p-2.5 sm:p-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${column.color}`} />
                    <h3 className={`font-bold text-sm sm:text-base ${column.color}`}>{column.label}</h3>
                  </div>
                  <span className={`${column.color} font-bold text-lg sm:text-xl`}>
                    {columnContracts.length}
                  </span>
                </div>
              </div>

              <div className={`flex-1 ${column.bgColor} ${column.borderColor} border-2 border-t-0 rounded-b-lg p-2 sm:p-3 space-y-2 min-h-[200px] max-h-[60vh] lg:max-h-[calc(100vh-280px)] overflow-y-auto`}>
                {columnContracts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Icon className={`w-8 h-8 ${column.color} opacity-50 mx-auto mb-2`} />
                    <p className="font-medium text-sm">No agreements</p>
                  </div>
                ) : (
                  columnContracts.map((contract) => {
                    const daysRemaining = getDaysRemaining(contract.magic_link_expires_at);
                    const expired = isExpired(contract.magic_link_expires_at);

                    return (
                      <div
                        key={contract.id}
                        className="bg-white border border-gray-200 rounded-lg p-2.5 sm:p-3 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-xs sm:text-sm text-gray-900 mb-0.5 truncate">
                              {contract.contact?.full_name || 'Unknown'}
                            </h4>
                            <p className="text-xs text-gray-600 break-words line-clamp-1">
                              {contract.contact?.email || 'No email'}
                            </p>
                            {contract.contact?.phone && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {contract.contact.phone}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 mb-2">
                          <div className="flex items-center gap-1.5 text-xs text-gray-700">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            <span className="font-medium truncate">{contract.template?.name || 'No template'}</span>
                          </div>

                          {contract.monthly_price && (
                            <div className="text-xs text-gray-700 ml-4">
                              <span className="font-semibold">${contract.monthly_price}/mo</span>
                            </div>
                          )}

                          {contract.invitation_sent_at && (
                            <div className="flex items-start gap-1.5 text-xs text-gray-600">
                              <Send className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              <span>
                                Sent {formatDateTime(contract.invitation_sent_at)}
                                {contract.invitation_sent_by && (
                                  <span className="text-gray-500">
                                    {' '}by{' '}
                                    <span className="font-medium text-gray-700">
                                      {contract.invitation_sent_by.full_name ||
                                        [contract.invitation_sent_by.first_name, contract.invitation_sent_by.last_name].filter(Boolean).join(' ') ||
                                        'Unknown'}
                                    </span>
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {expired ? (
                            <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span>Link Expired</span>
                            </div>
                          ) : daysRemaining !== null && (
                            <div className={`flex items-center gap-1.5 text-xs ${daysRemaining <= 7 ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span>
                                {daysRemaining > 0 ? `${daysRemaining}d left` : 'Expires today'}
                              </span>
                            </div>
                          )}
                        </div>

                        {contract.notes && (
                          <p className="text-xs text-gray-600 mb-2 p-1.5 bg-gray-50 rounded border border-gray-200 line-clamp-2">
                            {contract.notes}
                          </p>
                        )}

                        <div className="flex flex-col gap-1.5">
                          {contract.status === 'draft' && !contract.invitation_sent_at && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => promptSendInvitation(contract, false)}
                                className="px-2 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>Send</span>
                              </button>
                              <button
                                onClick={() => {
                                  setContractForManualEntry(contract);
                                  setShowManualEntry(true);
                                }}
                                className="px-2 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Manual</span>
                              </button>
                            </div>
                          )}

                          {contract.status === 'pending_customer' && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => promptSendInvitation(contract, true)}
                                className="px-2 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded hover:bg-orange-700 transition-colors flex items-center justify-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Re-send</span>
                              </button>
                              <button
                                onClick={() => {
                                  setContractForManualEntry(contract);
                                  setShowManualEntry(true);
                                }}
                                className="px-2 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Complete</span>
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => {
                                setContractToEdit(contract);
                                setShowEditModal(true);
                              }}
                              className="px-2 py-1.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setSelectedContract(contract)}
                              className="px-2 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => promptDelete(contract)}
                              className="px-2 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                              title="Delete Contract"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
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

      {/* Animated Dialog */}
      <SendAgreementDialog
        state={dialog}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
      />

      {/* Modals */}
      {showCreateModal && (
        <CreateSecurityContractModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadContracts(false);
          }}
        />
      )}

      {showEditModal && contractToEdit && (
        <EditSecurityContractModal
          contract={contractToEdit}
          onClose={() => {
            setShowEditModal(false);
            setContractToEdit(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setContractToEdit(null);
            loadContracts(false);
          }}
        />
      )}

      {selectedContract && (
        <SecurityContractDetail
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onUpdate={() => {
            setSelectedContract(null);
            loadContracts(false);
          }}
        />
      )}

      {showManualEntry && contractForManualEntry && (
        <ManualContractEntry
          contract={contractForManualEntry}
          onClose={() => {
            setShowManualEntry(false);
            setContractForManualEntry(null);
          }}
          onComplete={() => {
            setShowManualEntry(false);
            setContractForManualEntry(null);
            loadContracts(false);
          }}
        />
      )}
    </div>
  );
}
