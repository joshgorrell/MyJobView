import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Search, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, FileText, Eye, CreditCard as Edit2, Filter, ArrowLeft, Loader2, Unlock, X, Pencil, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CreateChangeOrderModal } from './CreateChangeOrderModal';
import { ChangeOrderApprovalModal } from './ChangeOrderApprovalModal';
import ProposalBuilderCompact from '../Proposals/ProposalBuilderCompact';
import type { SalesOrderFull, ChangeOrderSummary } from '../Sales/SalesOrderDetail';

interface ChangeOrder {
  id: string;
  change_order_number: string;
  revision_number: number;
  title: string;
  description: string;
  reason: string;
  type: string;
  status: string;
  original_contract_amount: number;
  change_amount: number;
  tax_amount: number;
  new_contract_total: number;
  labor_hours_added: number;
  requires_customer_approval: boolean;
  customer_approved: boolean;
  created_at: string;
  approval_date: string | null;
  rejection_reason: string | null;
  billing_status?: string;
  amount_billed?: number;
  sales_order_id?: string;
  sales_order?: {
    order_number: string;
    proposal_id?: string;
  };
  project?: {
    name: string;
    project_number: string;
  };
  requester?: {
    full_name: string;
  };
  approver?: {
    full_name: string;
  };
  line_items_count?: number;
}

interface COBuilderData {
  proposalId: string;
  changeOrderId: string;
  coStatus: string;
  salesOrderId: string;
  salesOrder: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDateTime(isoString: string) {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
}

interface ChangeOrdersViewProps {
  initialCoId?: string | null;
  onCoOpened?: () => void;
  onCoIdChange?: (id: string | null) => void;
}

export function ChangeOrdersView({ initialCoId, onCoOpened, onCoIdChange }: ChangeOrdersViewProps = {}) {
  const { profile } = useAuth();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState<string>('');
  const [openBuilderId, setOpenBuilderId] = useState<string | null>(null);
  const [openBuilderData, setOpenBuilderData] = useState<COBuilderData | null>(null);
  const [loadingBuilder, setLoadingBuilder] = useState(false);
  const [confirmUnlockId, setConfirmUnlockId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pendingInitialCoId = React.useRef(initialCoId);

  useEffect(() => {
    if (!loading && pendingInitialCoId.current && changeOrders.length > 0) {
      const co = changeOrders.find(c => c.id === pendingInitialCoId.current);
      pendingInitialCoId.current = null;
      if (co) {
        openInBuilder(co);
        onCoOpened?.();
      }
    }
  }, [loading, changeOrders]);

  useEffect(() => {
    loadChangeOrders();

    const channel = supabase
      .channel('change-orders-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'change_orders'
      }, () => {
        loadChangeOrders();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadChangeOrders() {
    try {
      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          *,
          sales_order:sales_orders(order_number, proposal_id),
          project:projects(name, project_number),
          requester:profiles!change_orders_requested_by_fkey(full_name),
          approver:profiles!change_orders_approved_by_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const dataWithCounts = await Promise.all((data || []).map(async (co) => {
        const { count } = await supabase
          .from('change_order_line_items')
          .select('*', { count: 'exact', head: true })
          .eq('change_order_id', co.id);

        return { ...co, line_items_count: count || 0 };
      }));

      setChangeOrders(dataWithCounts);
    } catch (error) {
      console.error('Error loading change orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(changeOrderId: string) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
      const { error } = await supabase.rpc('reject_change_order', {
        p_change_order_id: changeOrderId,
        p_rejection_reason: reason,
      });

      if (error) throw error;
      loadChangeOrders();
    } catch (error) {
      console.error('Error rejecting change order:', error);
    }
  }

  async function unlockCO(coId: string) {
    setUnlockingId(coId);
    setUnlockError(null);
    try {
      const { data, error } = await supabase.rpc('unlock_change_order', {
        p_change_order_id: coId,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      setConfirmUnlockId(null);
      loadChangeOrders();
    } catch (err: any) {
      setUnlockError(err.message || 'Failed to unlock change order');
    } finally {
      setUnlockingId(null);
    }
  }

  function startRename(co: ChangeOrder) {
    setRenamingId(co.id);
    setRenameValue(co.title || '');
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function saveRename(coId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    try {
      const { error } = await supabase
        .from('change_orders')
        .update({ title: trimmed })
        .eq('id', coId);
      if (error) throw error;
      setChangeOrders(prev => prev.map(c => c.id === coId ? { ...c, title: trimmed } : c));
      setRenamingId(null);
    } catch (err) {
      console.error('Error renaming change order:', err);
    } finally {
      setRenameSaving(false);
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function openInBuilder(co: ChangeOrder) {
    setLoadingBuilder(true);
    setOpenBuilderId(co.id);
    onCoIdChange?.(co.id);
    try {
      const salesOrderId = co.sales_order_id;
      if (!salesOrderId) {
        setLoadingBuilder(false);
        return;
      }

      const { data: soData } = await supabase
        .from('sales_orders')
        .select(`
          *,
          contact:contacts(id, full_name, company_name, email, phone, tax_rate, default_payment_terms),
          proposal:proposals(id, proposal_number, title, tax_environment, tax_project_type),
          project:projects(id, project_number, name, status, assigned_pm, start_date, target_completion_date, substantial_completion_date, notes, internal_notes, job_site_address, pm:profiles!projects_assigned_pm_fkey(id, full_name))
        `)
        .eq('id', salesOrderId)
        .maybeSingle();

      if (!soData || !soData.proposal_id) {
        setLoadingBuilder(false);
        return;
      }

      const { data: coList } = await supabase
        .from('change_orders')
        .select('id, change_order_number, title, type, status, is_active, is_locked, change_amount, tax_amount, new_contract_total, billing_status, amount_billed, created_at, approval_date, requester:profiles!change_orders_requested_by_fkey(full_name)')
        .eq('sales_order_id', salesOrderId)
        .order('created_at', { ascending: false });

      setOpenBuilderData({
        proposalId: soData.proposal_id,
        changeOrderId: co.id,
        coStatus: co.status,
        salesOrderId,
        salesOrder: soData as unknown as SalesOrderFull,
        changeOrders: (coList || []) as unknown as ChangeOrderSummary[],
      });
    } catch (err) {
      console.error('Error loading CO builder data:', err);
    } finally {
      setLoadingBuilder(false);
    }
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      draft: 'bg-gray-700 text-gray-300 border border-gray-600',
      pending_approval: 'bg-amber-900/50 text-amber-300 border border-amber-700',
      approved: 'bg-green-900/50 text-green-300 border border-green-700',
      rejected: 'bg-red-900/50 text-red-300 border border-red-700',
      completed: 'bg-blue-900/50 text-blue-300 border border-blue-700',
    };
    return map[status] || 'bg-gray-700 text-gray-300 border border-gray-600';
  }

  function getBillingBadge(status: string | undefined) {
    const map: Record<string, string> = {
      unbilled: 'bg-gray-700/50 text-gray-400 border border-gray-600',
      partially_billed: 'bg-amber-900/40 text-amber-300 border border-amber-700',
      fully_billed: 'bg-green-900/40 text-green-300 border border-green-700',
    };
    return map[status || ''] || 'bg-gray-700/50 text-gray-400 border border-gray-600';
  }

  const filteredChangeOrders = changeOrders.filter(co => {
    const matchesSearch =
      co.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      co.change_order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (co.project?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || co.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: changeOrders.length,
    draft: changeOrders.filter(c => c.status === 'draft').length,
    pending_approval: changeOrders.filter(c => c.status === 'pending_approval').length,
    approved: changeOrders.filter(c => c.status === 'approved').length,
    rejected: changeOrders.filter(c => c.status === 'rejected').length,
  };

  const canApprove = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'project_manager';
  const canUnlock = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'project_manager';

  if (openBuilderId && loadingBuilder) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        <span className="ml-3 text-gray-400 text-sm">Loading change order...</span>
      </div>
    );
  }

  if (openBuilderId && openBuilderData) {
    const isReadOnly = openBuilderData.coStatus !== 'draft';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <button
            onClick={() => { setOpenBuilderId(null); setOpenBuilderData(null); onCoIdChange?.(null); loadChangeOrders(); }}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Change Orders
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-sm text-gray-400">
            SO: {openBuilderData.salesOrder.order_number}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ProposalBuilderCompact
            proposalId={openBuilderData.proposalId}
            changeOrderId={isReadOnly ? undefined : openBuilderData.changeOrderId}
            onCORefresh={loadChangeOrders}
            onBack={() => { setOpenBuilderId(null); setOpenBuilderData(null); onCoIdChange?.(null); loadChangeOrders(); }}
          />
        </div>
      </div>
    );
  }

  if (openBuilderId && !loadingBuilder && !openBuilderData) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
          <button
            onClick={() => { setOpenBuilderId(null); setOpenBuilderData(null); onCoIdChange?.(null); }}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Unable to load change order data. This CO may not be linked to a sales order.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading change orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Change Orders</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {filteredChangeOrders.length} change order{filteredChangeOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canApprove && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 min-h-[44px] bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 active:bg-cyan-800 transition-colors text-sm font-medium whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Change Order</span>
            <span className="sm:hidden">New CO</span>
          </button>
        )}
      </div>

      <CreateChangeOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={async (newId) => {
          await loadChangeOrders();
          if (newId) {
            const { data: newCO } = await supabase
              .from('change_orders')
              .select('*, sales_order:sales_orders(order_number, proposal_id)')
              .eq('id', newId)
              .maybeSingle();
            if (newCO) {
              openInBuilder({ ...newCO, line_items_count: 0 } as ChangeOrder);
            }
          }
        }}
      />

      {selectedChangeOrderId && (
        <ChangeOrderApprovalModal
          isOpen={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false);
            setSelectedChangeOrderId('');
          }}
          changeOrderId={selectedChangeOrderId}
          onSuccess={() => loadChangeOrders()}
        />
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
        <input
          type="text"
          placeholder="Search change orders..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors min-h-[44px]"
        />
      </div>

      <div className="flex gap-1 border-b border-gray-700 overflow-x-auto pb-px">
        {[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'pending_approval', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              statusFilter === filter.value
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {filter.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              statusFilter === filter.value ? 'bg-cyan-900/50 text-cyan-300' : 'bg-gray-700 text-gray-400'
            }`}>
              {statusCounts[filter.value as keyof typeof statusCounts] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredChangeOrders.length === 0 ? (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
            <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-300 mb-1">No change orders found</h3>
            <p className="text-gray-500 text-sm">
              {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first change order to get started.'}
            </p>
          </div>
        ) : (
          filteredChangeOrders.map(co => (
            <div
              key={co.id}
              className="bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="p-4">
                {/* Title row — full width */}
                <div className="w-full mb-2 overflow-hidden">
                  {renamingId === co.id ? (
                    <div className="flex items-center gap-1.5 w-full min-w-0">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(co.id);
                          if (e.key === 'Escape') cancelRename();
                        }}
                        maxLength={60}
                        className="flex-1 min-w-0 w-full bg-gray-700 border border-cyan-500 text-white text-sm font-bold rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-cyan-500"
                        autoFocus
                        disabled={renameSaving}
                      />
                      <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{renameValue.length}/60</span>
                      <button
                        onClick={() => saveRename(co.id)}
                        disabled={renameSaving || !renameValue.trim()}
                        className="p-1.5 rounded text-green-400 hover:text-green-300 hover:bg-green-900/30 transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        {renameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={cancelRename}
                        disabled={renameSaving}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-300 hover:bg-gray-700 transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 w-full min-w-0">
                      <h3 className="flex-1 min-w-0 text-sm font-bold text-white leading-snug truncate">
                        {co.title || <span className="italic text-gray-500 font-normal">Untitled change order</span>}
                      </h3>
                      <button
                        onClick={() => startRename(co)}
                        className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-700 active:bg-gray-600 transition-all flex-shrink-0"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* CO number + badges + meta */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-mono text-gray-400">{co.change_order_number}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusBadge(co.status)}`}>
                    {co.status.replace('_', ' ')}
                  </span>
                  {co.status === 'approved' && co.billing_status && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getBillingBadge(co.billing_status)}`}>
                      {co.billing_status.replace('_', ' ')}
                    </span>
                  )}
                  {co.revision_number > 0 && (
                    <span className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">Rev {co.revision_number}</span>
                  )}
                  {co.created_at && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(co.created_at)}
                    </span>
                  )}
                  {co.sales_order?.order_number && (
                    <span className="text-xs text-gray-400">SO: {co.sales_order.order_number}</span>
                  )}
                  {co.project && (
                    <span className="text-xs text-gray-400">{co.project.project_number} — {co.project.name}</span>
                  )}
                </div>

                {co.description && (
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{co.description}</p>
                )}

                {/* Stats row */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span>{co.line_items_count || 0} item{(co.line_items_count || 0) !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span>Change:</span>
                    <span className={`font-semibold ${co.change_amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {co.change_amount >= 0 ? '+' : ''}{formatCurrency(co.change_amount)}
                    </span>
                  </div>
                  {co.tax_amount > 0 && (
                    <div className="flex items-center gap-1">
                      <span>Tax: <span className="text-gray-300">{formatCurrency(co.tax_amount)}</span></span>
                    </div>
                  )}
                  {co.status === 'approved' && co.billing_status && co.amount_billed !== undefined && (
                    <div className="flex items-center gap-1">
                      <span>Billed: <span className="text-cyan-400 font-medium">{formatCurrency(co.amount_billed)}</span></span>
                    </div>
                  )}
                  {co.new_contract_total != null && co.new_contract_total > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">
                        {co.status === 'approved' ? 'New total:' : 'Proj total:'}
                      </span>
                      <span className="text-gray-300 tabular-nums">{formatCurrency(co.new_contract_total)}</span>
                    </div>
                  )}
                </div>

                {co.requires_customer_approval && !co.customer_approved && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Requires customer approval</span>
                  </div>
                )}

                {co.rejection_reason && (
                  <div className="mt-2 p-2 bg-red-900/20 border border-red-800/40 rounded-lg">
                    <p className="text-xs text-red-300">
                      <span className="font-semibold">Rejected:</span> {co.rejection_reason}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {co.status === 'draft' && (
                    <button
                      onClick={() => openInBuilder(co)}
                      className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-cyan-600 text-white text-xs rounded-lg hover:bg-cyan-700 active:bg-cyan-800 transition-colors font-medium"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  {(co.status === 'pending_approval' || co.status === 'approved' || co.status === 'rejected' || co.status === 'completed') && (
                    <button
                      onClick={() => openInBuilder(co)}
                      className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-gray-700 text-gray-300 text-xs rounded-lg hover:bg-gray-600 active:bg-gray-500 transition-colors font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                  )}
                  {co.status === 'pending_approval' && canApprove && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedChangeOrderId(co.id);
                          setShowApprovalModal(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-green-700 text-green-100 text-xs rounded-lg hover:bg-green-600 active:bg-green-800 transition-colors font-medium"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(co.id)}
                        className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-red-800/50 text-red-300 text-xs rounded-lg hover:bg-red-700/50 active:bg-red-900/50 transition-colors font-medium border border-red-700/50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                  {(co as any).is_locked && canUnlock && (
                    <button
                      onClick={() => { setConfirmUnlockId(co.id); setUnlockError(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-amber-700/40 hover:bg-amber-700/70 active:bg-amber-800/70 text-amber-300 border border-amber-700/50 text-xs rounded-lg transition-colors font-medium"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Unlock
                    </button>
                  )}
                </div>

                {confirmUnlockId === co.id && (
                  <div className="mt-3 p-3 rounded-lg border border-amber-800/40 bg-amber-950/20">
                    <div className="flex items-start gap-3">
                      <Unlock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-300">Unlock this change order?</p>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                          It will be reset to draft and must go through approval again.
                        </p>
                        {unlockError && (
                          <p className="text-xs text-red-400 mt-1.5">{unlockError}</p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => unlockCO(co.id)}
                            disabled={unlockingId === co.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            {unlockingId === co.id
                              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Unlock className="w-3 h-3" />
                            }
                            {unlockingId === co.id ? 'Unlocking...' : 'Confirm Unlock'}
                          </button>
                          <button
                            onClick={() => { setConfirmUnlockId(null); setUnlockError(null); }}
                            className="px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-gray-600 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => { setConfirmUnlockId(null); setUnlockError(null); }}
                        className="text-amber-500 hover:text-amber-300 transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
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
