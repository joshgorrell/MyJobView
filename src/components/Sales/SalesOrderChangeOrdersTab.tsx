import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, ChevronDown, ChevronUp, Clock, FileText, User, History, PlusCircle, Pencil, ArrowRight, Trash2, Package, AlertTriangle, X, ArrowUpRight, CheckCircle, CreditCard as Edit2, Lock, Unlock, Banknote, Eye, EyeOff, Send, Check, MoreHorizontal } from 'lucide-react';
import { ChangeOrderReportModal } from './ChangeOrderReportModal';
import { ChangeOrderProductReportModal } from './ChangeOrderProductReportModal';
import { CreateChangeOrderModal } from '../Production/CreateChangeOrderModal';
import { ChangeOrderApprovalModal } from '../Production/ChangeOrderApprovalModal';
import { ChangeOrderApprovalFlowModal } from '../Production/ChangeOrderApprovalFlowModal';
import { TransferChangeOrderModal } from './TransferChangeOrderModal';
import ProposalBuilderCompact from '../Proposals/ProposalBuilderCompact';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';

interface HistoryEntry {
  id: string;
  action: string;
  performed_by: string;
  description: string;
  snapshot: any;
  created_at: string;
  performer?: { full_name: string };
}

interface COLineItemDisplay {
  id: string;
  action_type: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | 'modify_labor' | 'modify_modifiers';
  product_name: string;
  room_name: string | null;
  original_quantity: number | null;
  original_unit_price: number | null;
  original_total: number | null;
  original_labor_total: number | null;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  new_labor_total: number;
  change_amount: number;
  item_type: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  remove_scope: 'parts_only' | 'parts_and_labor' | null;
  modifier_adjustments: Array<{ label: string; field: string; old_value: number; new_value: number }> | null;
}

interface COHistoryData {
  lineItems: COLineItemDisplay[];
  statusEvents: HistoryEntry[];
}

interface SalesOrderChangeOrdersTabProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
  onRefresh: () => void;
}

export function SalesOrderChangeOrdersTab({ order, changeOrders, onRefresh }: SalesOrderChangeOrdersTabProps) {
  const { profile } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, COHistoryData>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedCOId, setSelectedCOId] = useState<string>('');
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [selectedFlowCO, setSelectedFlowCO] = useState<ChangeOrderSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [reportCO, setReportCO] = useState<ChangeOrderSummary | null>(null);
  const [productReportCO, setProductReportCO] = useState<ChangeOrderSummary | null>(null);
  const [transferCO, setTransferCO] = useState<ChangeOrderSummary | null>(null);
  const [transferredProposalId, setTransferredProposalId] = useState<string | null>(null);
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);
  const [submitConfirmCOId, setSubmitConfirmCOId] = useState<string | null>(null);
  const [blockEditCOId, setBlockEditCOId] = useState<string | null>(null);
  const [inlineEditorCOId, setInlineEditorCOId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState('');
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [confirmUnlockId, setConfirmUnlockId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [overflowMenuId, setOverflowMenuId] = useState<string | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setOverflowMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [overflowMenuId]);

  const canApprove = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'project_manager';
  const canUnlock = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'project_manager';

  async function loadHistory(changeOrderId: string) {
    try {
      const [lineItemsRes, statusEventsRes] = await Promise.all([
        supabase
          .from('change_order_line_items')
          .select('id, action_type, product_name, room_name, original_quantity, original_unit_price, original_total, original_labor_total, new_quantity, new_unit_price, new_total, new_labor_total, change_amount, item_type, labor_hours, labor_rate, remove_scope, modifier_adjustments')
          .eq('change_order_id', changeOrderId)
          .order('sort_order'),
        supabase
          .from('change_order_history')
          .select('id, action, performed_by, description, snapshot, created_at')
          .eq('change_order_id', changeOrderId)
          .in('action', ['created', 'status_changed', 'deleted'])
          .order('created_at', { ascending: false }),
      ]);

      const lineItems = (lineItemsRes.data || []) as COLineItemDisplay[];

      const statusRaw = statusEventsRes.data || [];
      const profileIds = [...new Set(statusRaw.map((h: any) => h.performed_by).filter(Boolean))];
      let profiles: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', profileIds);
        profiles = (pData || []).reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {} as Record<string, string>);
      }
      const statusEvents: HistoryEntry[] = statusRaw.map((h: any) => ({
        ...h,
        performer: h.performed_by ? { full_name: profiles[h.performed_by] || 'Unknown' } : undefined,
      }));

      setHistoryMap(prev => ({ ...prev, [changeOrderId]: { lineItems, statusEvents } }));
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadHistory(id);
    }
  }

  function startEditingNotes(co: ChangeOrderSummary) {
    setEditingNotesId(co.id);
    setEditingNotesValue(co.notes || '');
  }

  function cancelEditingNotes() {
    setEditingNotesId(null);
    setEditingNotesValue('');
  }

  async function saveNotes(coId: string) {
    setSavingNotesId(coId);
    try {
      const { error } = await supabase
        .from('change_orders')
        .update({ notes: editingNotesValue.trim() || null })
        .eq('id', coId);
      if (error) throw error;
      setEditingNotesId(null);
      setEditingNotesValue('');
      onRefresh();
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingNotesId(null);
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
      onRefresh();
    } catch (err: any) {
      setUnlockError(err.message || 'Failed to unlock change order');
    } finally {
      setUnlockingId(null);
    }
  }

  async function activateCO(co: ChangeOrderSummary) {
    if (co.status !== 'draft') return;
    if (inlineEditorCOId === co.id) {
      await deactivateCO(co.id);
      return;
    }
    if (inlineEditorCOId && inlineEditorCOId !== co.id) {
      setBlockEditCOId(co.id);
      return;
    }
    setActivating(co.id);
    try {
      await supabase
        .from('change_orders')
        .update({ is_active: false })
        .eq('sales_order_id', order.id);

      await supabase
        .from('change_orders')
        .update({ is_active: true })
        .eq('id', co.id);

      setInlineEditorCOId(co.id);
      onRefresh();
    } catch (err) {
      console.error('Error activating CO:', err);
    } finally {
      setActivating(null);
    }
  }

  async function submitCOForApproval(co: ChangeOrderSummary) {
    setSubmittingApprovalId(co.id);
    try {
      await supabase
        .from('change_orders')
        .update({ status: 'pending_approval', is_active: false })
        .eq('id', co.id);
      setInlineEditorCOId(null);
      setSubmitConfirmCOId(null);
      onRefresh();
    } catch (err) {
      console.error('Error submitting CO for approval:', err);
    } finally {
      setSubmittingApprovalId(null);
    }
  }

  async function deactivateCO(coId: string) {
    try {
      await supabase
        .from('change_orders')
        .update({ is_active: false })
        .eq('id', coId);
      setInlineEditorCOId(null);
      onRefresh();
    } catch (err) {
      console.error('Error deactivating CO:', err);
    }
  }

  async function toggleShowOnReport(co: ChangeOrderSummary) {
    try {
      await supabase
        .from('change_orders')
        .update({ show_on_report: !co.show_on_report })
        .eq('id', co.id);
      onRefresh();
    } catch (err) {
      console.error('Error toggling show_on_report:', err);
    }
  }

  async function deleteCO(co: ChangeOrderSummary) {
    setDeletingId(co.id);
    try {
      // Fetch the full change order including the snapshot
      const { data: fullCO } = await supabase
        .from('change_orders')
        .select('proposal_snapshot')
        .eq('id', co.id)
        .maybeSingle();

      const snapshot = fullCO?.proposal_snapshot;

      if (snapshot && snapshot.proposal_id) {
        // Use snapshot-based revert — restore the proposal exactly as it was
        const { error: revertError } = await supabase.rpc('revert_proposal_from_snapshot', {
          p_proposal_id: snapshot.proposal_id,
          p_snapshot: snapshot
        });

        if (revertError) {
          console.error('Snapshot revert failed, falling back to manual revert:', revertError);
          // Fallback: manual revert via line item records
          await manualRevertCO(co.id);
        }
      } else {
        // No snapshot available — use the legacy manual revert
        await manualRevertCO(co.id);
      }

      // Cascade delete the CO records
      await supabase.from('change_order_line_items').delete().eq('change_order_id', co.id);
      await supabase.from('change_order_approvals').delete().eq('change_order_id', co.id);
      await supabase.from('change_orders').delete().eq('id', co.id);

      // Recalculate proposal totals after revert
      if (snapshot?.proposal_id) {
        await supabase.rpc('calculate_proposal_totals', { p_proposal_id: snapshot.proposal_id });
      }

      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      console.error('Error deleting CO:', err);
    } finally {
      setDeletingId(null);
    }
  }

  async function manualRevertCO(changeOrderId: string) {
    const { data: lineItems } = await supabase
      .from('change_order_line_items')
      .select('id, action_type, proposal_line_item_id, original_quantity, original_unit_price')
      .eq('change_order_id', changeOrderId);

    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        if (item.action_type === 'add' && item.proposal_line_item_id) {
          await supabase
            .from('proposal_line_items')
            .delete()
            .eq('id', item.proposal_line_item_id);
        } else if (item.action_type === 'remove' && item.proposal_line_item_id) {
          await supabase
            .from('proposal_line_items')
            .update({ is_hidden: false })
            .eq('id', item.proposal_line_item_id);
        } else if ((item.action_type === 'modify_quantity' || item.action_type === 'modify_price') && item.proposal_line_item_id) {
          const updates: Record<string, any> = {};
          if (item.action_type === 'modify_quantity' && item.original_quantity != null) {
            updates.quantity = item.original_quantity;
          }
          if (item.action_type === 'modify_price' && item.original_unit_price != null) {
            updates.unit_price = item.original_unit_price;
          }
          if (Object.keys(updates).length > 0) {
            await supabase
              .from('proposal_line_items')
              .update(updates)
              .eq('id', item.proposal_line_item_id);
          }
        }
      }
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'pending_approval': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'transferred': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  }

  function getBillingStyle(status: string | undefined) {
    switch (status) {
      case 'fully_billed': return 'bg-green-500/20 text-green-400';
      case 'partially_billed': return 'bg-amber-500/20 text-amber-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  }

  function getHistoryIcon(action: string) {
    switch (action) {
      case 'created': return PlusCircle;
      case 'modified': return Pencil;
      case 'status_changed': return ArrowRight;
      case 'deleted': return Trash2;
      case 'line_item_added': return Package;
      case 'line_item_removed': return Trash2;
      case 'line_item_modified': return Pencil;
      default: return History;
    }
  }

  function relativeTime(dateStr: string) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  const filtered = changeOrders.filter(co => statusFilter === 'all' || co.status === statusFilter);

  const runningTotalMap = (() => {
    const chronological = [...changeOrders].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const map: Record<string, number> = {};
    let running = order.original_contract_total ?? order.contract_total ?? 0;
    for (const co of chronological) {
      running += co.change_amount || 0;
      map[co.id] = running;
    }
    return map;
  })();

  const statusCounts = {
    all: changeOrders.length,
    draft: changeOrders.filter(c => c.status === 'draft').length,
    pending_approval: changeOrders.filter(c => c.status === 'pending_approval').length,
    approved: changeOrders.filter(c => c.status === 'approved').length,
    rejected: changeOrders.filter(c => c.status === 'rejected').length,
    transferred: changeOrders.filter(c => c.status === 'transferred').length,
  };

  const openEditorCO = changeOrders.find(co => co.id === inlineEditorCOId);

  return (
    <div className="space-y-4">

      {inlineEditorCOId && openEditorCO && openEditorCO.status === 'draft' && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-amber-700/40 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-gray-500">{openEditorCO.change_order_number}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">EDITING</span>
              <span className="text-sm text-white font-medium truncate">{openEditorCO.title}</span>
            </div>
            <button
              onClick={() => { setInlineEditorCOId(null); onRefresh(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors flex-shrink-0 ml-4"
            >
              <X className="w-4 h-4" />
              Close Editor
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProposalBuilderCompact
              proposalId={order.proposal_id}
              changeOrderId={openEditorCO.id}
              onCORefresh={onRefresh}
              onBack={() => { setInlineEditorCOId(null); onRefresh(); }}
            />
          </div>
        </div>
      )}

      {transferredProposalId && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-900/30 border border-green-700/40 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-300">Change order transferred successfully.</p>
            <p className="text-xs text-green-400/80 mt-0.5">A new draft proposal has been created with the same rooms and line items.</p>
          </div>
          <button
            onClick={() => setTransferredProposalId(null)}
            className="text-green-500 hover:text-green-300 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Change Order
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {changeOrders.length === 0
              ? 'No change orders for this sales order yet.'
              : 'No change orders match the selected filter.'
            }
          </p>
          {changeOrders.length === 0 && (
            <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
              Create a change order and click Edit to add or modify line items.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(co => {
            const isExpanded = expandedId === co.id;
            const historyData = historyMap[co.id];
            const coLineItems = historyData?.lineItems || [];
            const statusEvents = historyData?.statusEvents || [];
            const isDraft = co.status === 'draft';
            const isDeletingThis = deletingId === co.id;
            const isConfirmingDelete = confirmDeleteId === co.id;

            const isEditorOpen = inlineEditorCOId === co.id;

            return (
              <div
                key={co.id}
                className={`rounded-lg border overflow-hidden transition-colors ${
                  isEditorOpen
                    ? 'bg-amber-950/20 border-amber-700/50'
                    : 'bg-gray-900/50 border-gray-700/50'
                }`}
              >
                {/* Card: single clickable header area */}
                <div
                  className="px-3 py-2.5 cursor-pointer hover:bg-gray-700/10 transition-colors"
                  onClick={() => toggleExpand(co.id)}
                >
                  {/* Title row — full width, bold */}
                  <div className="w-full mb-2 overflow-hidden">
                    <h4 className="w-full text-white font-bold text-sm leading-snug truncate">
                      {co.title || <span className="italic text-gray-500 font-normal">Untitled change order</span>}
                    </h4>
                    {!isExpanded && co.notes && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed break-words whitespace-pre-line">
                        {co.notes}
                      </p>
                    )}
                  </div>

                  {/* Top row: CO number + status badges + amount + chevron */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-xs font-mono text-gray-500 shrink-0">{co.change_order_number}</span>
                      {isEditorOpen && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse shrink-0">
                          EDITING
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${getStatusStyle(co.status)}`}>
                        {co.status.replace(/_/g, ' ')}
                      </span>
                      {co.status === 'approved' && co.billing_status && (
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${getBillingStyle(co.billing_status)}`}>
                          {co.billing_status.replace(/_/g, ' ')}
                        </span>
                      )}
                      {co.status === 'approved' && !co.is_billable && (
                        <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-700/60 text-gray-400 border border-gray-600/50 shrink-0">
                          Non-Billable
                        </span>
                      )}
                      {co.status === 'approved' && (
                        (co.show_on_report === false && !co.is_billable) ? (
                          <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400 border border-slate-600/50 shrink-0 items-center gap-1">
                            <EyeOff className="w-2.5 h-2.5" />
                            Private
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-400 border border-blue-700/40 shrink-0 items-center gap-1">
                            <Eye className="w-2.5 h-2.5" />
                            Public
                          </span>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-semibold tabular-nums ${
                          co.status === 'draft' && !co.change_amount
                            ? 'text-gray-500'
                            : co.change_amount >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {co.status === 'draft' && !co.change_amount
                            ? '—'
                            : `${co.change_amount >= 0 ? '+' : '−'}$${Math.abs(co.change_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          }
                        </span>
                        {runningTotalMap[co.id] != null && (
                          <span className="text-[10px] text-gray-500 tabular-nums leading-tight">
                            {co.status === 'approved'
                              ? `Total: $${(co.new_contract_total ?? runningTotalMap[co.id]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `Proj: $${runningTotalMap[co.id].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            }
                          </span>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-gray-500" />
                        : <ChevronDown className="w-4 h-4 text-gray-500" />
                      }
                    </div>
                  </div>

                  {/* Meta + actions row — full width on mobile, inline on sm+ */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 min-w-0">
                    {/* Meta */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="hidden sm:flex items-center gap-x-3 gap-y-1 shrink-0">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[140px]">{co.requester?.full_name || 'Unknown'}</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500" title={new Date(co.created_at).toLocaleString()}>
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{new Date(co.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </span>
                        {co.status === 'approved' && co.approval_date && (
                          <span className="flex items-center gap-1 text-xs text-green-500/80" title={new Date(co.approval_date).toLocaleString()}>
                            <CheckCircle className="w-3 h-3 shrink-0" />
                            <span>
                              Approved {new Date(co.approval_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              {(co.approved_by_name || co.approver?.full_name) ? ` · ${co.approved_by_name || co.approver?.full_name}` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      {isDraft && (
                        <button
                          onClick={() => activateCO(co)}
                          disabled={!!activating && activating !== co.id}
                          title={isEditorOpen ? 'Close the inline editor' : 'Edit this change order'}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                            isEditorOpen
                              ? 'bg-amber-600 hover:bg-amber-500 text-white'
                              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                          }`}
                        >
                          {activating === co.id
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : isEditorOpen
                              ? <ChevronUp className="w-3 h-3" />
                              : <Edit2 className="w-3 h-3" />
                          }
                          {isEditorOpen ? 'Close' : 'Edit'}
                        </button>
                      )}

                      {isDraft && (
                        <button
                          onClick={() => { setSelectedFlowCO(co); setShowFlowModal(true); }}
                          title="Approve this change order"
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Approve
                        </button>
                      )}

                      {co.status === 'pending_approval' && canApprove && (
                        <button
                          onClick={() => { setSelectedCOId(co.id); setShowApprovalModal(true); }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Review
                        </button>
                      )}

                      {co.is_locked && canUnlock && (
                        <button
                          onClick={() => { setConfirmUnlockId(co.id); setUnlockError(null); }}
                          title="Unlock this change order to allow edits and re-approval"
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-700/40 hover:bg-amber-700/70 text-amber-300 border border-amber-700/50 rounded-md transition-colors"
                        >
                          <Unlock className="w-3 h-3" />
                          Unlock
                        </button>
                      )}

                      {/* Secondary icon buttons — visible on sm+, hidden on mobile */}
                      <div className="hidden sm:flex items-center gap-1.5">
                        <div className="w-px h-4 bg-gray-700 mx-0.5" />
                        <button
                          onClick={() => setReportCO(co)}
                          title="View / print change order report"
                          className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setProductReportCO(co)}
                          title="View / print product list for this change order"
                          className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                        >
                          <Package className="w-3.5 h-3.5" />
                        </button>
                        {co.status === 'approved' && !co.is_billable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleShowOnReport(co); }}
                            title={co.show_on_report !== false ? 'Shown on customer reports — click to mark as Private' : 'Private — hidden from customer reports — click to show'}
                            className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                          >
                            {co.show_on_report !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {isDraft && !isEditorOpen && (
                          <button
                            onClick={() => setTransferCO(co)}
                            title="Transfer this change order to a new proposal"
                            className="p-1 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-md transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(isDraft && !isEditorOpen) && (
                          <button
                            onClick={() => setConfirmDeleteId(co.id)}
                            title="Delete this change order and revert all changes"
                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {co.status === 'approved' && (
                          (co.amount_billed || 0) === 0 ? (
                            <button
                              onClick={() => setConfirmDeleteId(co.id)}
                              title="Delete this approved change order"
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              disabled
                              title={`Cannot delete — $${(co.amount_billed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} has been billed. Delete the related invoices first.`}
                              className="p-1 text-gray-700 cursor-not-allowed rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>

                      {/* Mobile overflow menu — "..." button shows secondary actions */}
                      <div className="relative flex sm:hidden" ref={overflowMenuId === co.id ? overflowMenuRef : undefined}>
                        <button
                          onClick={() => setOverflowMenuId(overflowMenuId === co.id ? null : co.id)}
                          className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {overflowMenuId === co.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[160px] max-w-[calc(100vw-2rem)] py-1 overflow-hidden">
                            <button
                              onClick={() => { setReportCO(co); setOverflowMenuId(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              View Report
                            </button>
                            <button
                              onClick={() => { setProductReportCO(co); setOverflowMenuId(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                            >
                              <Package className="w-3.5 h-3.5 shrink-0" />
                              Product List
                            </button>
                            {co.status === 'approved' && !co.is_billable && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleShowOnReport(co); setOverflowMenuId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                              >
                                {co.show_on_report !== false ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                                {co.show_on_report !== false ? 'Mark Private' : 'Mark Public'}
                              </button>
                            )}
                            {isDraft && !isEditorOpen && (
                              <button
                                onClick={() => { setTransferCO(co); setOverflowMenuId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                Transfer to Proposal
                              </button>
                            )}
                            {isDraft && !isEditorOpen && (
                              <button
                                onClick={() => { setConfirmDeleteId(co.id); setOverflowMenuId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                Delete & Revert
                              </button>
                            )}
                            {co.status === 'approved' && (co.amount_billed || 0) === 0 && (
                              <button
                                onClick={() => { setConfirmDeleteId(co.id); setOverflowMenuId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile-only meta row */}
                  <div className="flex sm:hidden items-center gap-x-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <User className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[100px]">{co.requester?.full_name || 'Unknown'}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500" title={new Date(co.created_at).toLocaleString()}>
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{new Date(co.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </span>
                    {co.status === 'approved' && co.approval_date && (
                      <span className="flex items-center gap-1 text-xs text-green-500/80">
                        <CheckCircle className="w-3 h-3 shrink-0" />
                        <span>Approved {new Date(co.approval_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </span>
                    )}
                  </div>
                </div>

                {isConfirmingDelete && (
                  <div className="border-t border-red-800/40 bg-red-950/30 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-300">Delete this change order?</p>
                        <p className="text-xs text-red-400/80 mt-0.5">
                          All recorded changes (added items, removed items, quantity / price edits) will be reverted. This cannot be undone.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 mt-3">
                          <button
                            onClick={() => deleteCO(co)}
                            disabled={isDeletingThis}
                            className="flex items-center justify-center gap-1 px-3 py-2 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 min-h-[40px] sm:min-h-0"
                          >
                            {isDeletingThis
                              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Trash2 className="w-3 h-3" />
                            }
                            {isDeletingThis ? 'Deleting...' : 'Delete & Revert'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-2 text-xs text-gray-300 hover:text-white border border-gray-600 rounded-lg transition-colors min-h-[40px] sm:min-h-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {confirmUnlockId === co.id && (
                  <div className="border-t border-amber-800/40 bg-amber-950/20 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Unlock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-300">Unlock this change order?</p>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                          The change order will be reset to draft status. Any existing approval records will be cleared and it will need to go through approval again before being applied.
                        </p>
                        {unlockError && (
                          <p className="text-xs text-red-400 mt-1.5">{unlockError}</p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 mt-3">
                          <button
                            onClick={() => unlockCO(co.id)}
                            disabled={unlockingId === co.id}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 min-h-[40px] sm:min-h-0"
                          >
                            {unlockingId === co.id
                              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Unlock className="w-3 h-3" />
                            }
                            {unlockingId === co.id ? 'Unlocking...' : 'Confirm Unlock'}
                          </button>
                          <button
                            onClick={() => { setConfirmUnlockId(null); setUnlockError(null); }}
                            className="px-3 py-2 text-xs text-gray-300 hover:text-white border border-gray-600 rounded-lg transition-colors min-h-[40px] sm:min-h-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {blockEditCOId === co.id && (
                  <div className="border-t border-orange-800/40 bg-orange-950/30 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-300">Another change order is currently open for editing.</p>
                        <p className="text-xs text-orange-400/80 mt-0.5">
                          Close the active editor first before opening a different change order.
                        </p>
                      </div>
                      <button
                        onClick={() => setBlockEditCOId(null)}
                        className="text-orange-500 hover:text-orange-300 transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {submitConfirmCOId === co.id && (() => {
                  const delta = co.change_amount || 0;
                  const isPos = delta > 0;
                  const fmtAmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
                  return (
                    <div className="border-t border-blue-800/40 bg-blue-950/30 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Send className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-300">Submit {co.change_order_number} for approval?</p>
                          <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                            <span className="text-gray-400">Change: <span className={`font-semibold ${isPos ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-300'}`}>{isPos ? '+' : delta < 0 ? '−' : ''}{fmtAmt(delta)}</span></span>
                            {co.new_contract_total != null && (
                              <span className="text-gray-400">New total: <span className="font-semibold text-white">{fmtAmt(co.new_contract_total)}</span></span>
                            )}
                          </div>
                          <p className="text-xs text-blue-400/70 mt-1.5">The editor will be closed and the change order will be locked for approval review.</p>
                          <div className="flex flex-col sm:flex-row gap-2 mt-3">
                            <button
                              onClick={() => submitCOForApproval(co)}
                              disabled={submittingApprovalId === co.id}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 min-h-[40px] sm:min-h-0"
                            >
                              {submittingApprovalId === co.id
                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Send className="w-3 h-3" />
                              }
                              {submittingApprovalId === co.id ? 'Submitting...' : 'Submit'}
                            </button>
                            <button
                              onClick={() => setSubmitConfirmCOId(null)}
                              className="px-3 py-2 text-xs text-gray-300 hover:text-white border border-gray-600 rounded-lg transition-colors min-h-[40px] sm:min-h-0"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}


                {isExpanded && (
                  <div className="border-t border-gray-700/50 p-4 space-y-4">
                    {co.status === 'approved' && (
                      <div className="grid grid-cols-1 gap-3">
                        <MiniStat label="Amount Billed" value={`$${(co.amount_billed || 0).toFixed(2)}`} color={co.amount_billed >= Math.abs(co.change_amount) ? 'green' : 'amber'} />
                      </div>
                    )}

                    {/* Approval record card — shown for approved COs */}
                    {co.status === 'approved' && co.approval_date && (
                      <div className="bg-green-900/10 border border-green-700/30 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">Approval Record</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                          <div>
                            <span className="text-gray-500">Approved by</span>
                            <span className="ml-1.5 text-gray-200 font-medium">{co.approved_by_name || co.approver?.full_name || 'Unknown'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Date &amp; Time</span>
                            <span className="ml-1.5 text-gray-200 font-medium">
                              {new Date(co.approval_date).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Method</span>
                            <span className="ml-1.5 text-gray-200 font-medium capitalize">Internal / Manual</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Billing</span>
                            <span className="ml-1.5 text-gray-200 font-medium">{co.is_billable ? 'Billable' : 'Non-Billable'}</span>
                          </div>
                        </div>
                        {co.approval_notes && (
                          <div className="mt-2 pt-2 border-t border-green-700/20">
                            <span className="text-xs text-gray-500">Notes: </span>
                            <span className="text-xs text-gray-300">{co.approval_notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {co.status === 'approved' && co.billing_status !== 'fully_billed' && (
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-green-900/20 border border-green-700/30 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-green-300 font-medium">Approved — Ready to Bill</p>
                          <p className="text-xs text-green-400/70 mt-0.5">
                            {co.billing_status === 'partially_billed'
                              ? `$${(Math.abs(co.change_amount) - (co.amount_billed || 0)).toFixed(2)} remaining to bill`
                              : `$${Math.abs(co.change_amount || 0).toFixed(2)} available to invoice`
                            }
                          </p>
                        </div>
                        <button
                          onClick={() => { setSelectedCOId(co.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors flex-shrink-0"
                          title="Create an invoice for this change order"
                        >
                          <Banknote className="w-3 h-3" />
                          Bill CO
                        </button>
                      </div>
                    )}

                    {co.status !== 'approved' && co.status !== 'rejected' && co.status !== 'transferred' && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-800/50 border border-gray-700/30 rounded-lg">
                        <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <p className="text-xs text-gray-500">
                          Billing is only available for approved change orders. Submit for approval to proceed.
                        </p>
                      </div>
                    )}

                    {/* Notes — always editable */}
                    <div className="border border-gray-700/40 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border-b border-gray-700/30">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</span>
                        </div>
                        {editingNotesId !== co.id && (
                          <button
                            onClick={() => startEditingNotes(co)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded transition-colors"
                            title="Edit notes"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                      </div>
                      <div className="p-3">
                        {editingNotesId === co.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingNotesValue}
                              onChange={e => setEditingNotesValue(e.target.value)}
                              rows={3}
                              autoFocus
                              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                              placeholder="Add notes about this change order..."
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={cancelEditingNotes}
                                className="flex items-center gap-1 px-3 py-2 min-h-[36px] text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-colors touch-manipulation"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                              <button
                                onClick={() => saveNotes(co.id)}
                                disabled={savingNotesId === co.id}
                                className="flex items-center gap-1 px-3 py-2 min-h-[36px] text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors touch-manipulation"
                              >
                                {savingNotesId === co.id
                                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  : <Check className="w-3 h-3" />
                                }
                                Save
                              </button>
                            </div>
                          </div>
                        ) : co.notes ? (
                          <p
                            className="text-sm text-gray-300 whitespace-pre-wrap cursor-pointer hover:text-gray-100 transition-colors"
                            onClick={() => startEditingNotes(co)}
                            title="Click to edit"
                          >
                            {co.notes}
                          </p>
                        ) : (
                          <p
                            className="text-xs text-gray-600 italic cursor-pointer hover:text-gray-400 transition-colors"
                            onClick={() => startEditingNotes(co)}
                          >
                            No notes — click to add...
                          </p>
                        )}
                      </div>
                    </div>

                    {coLineItems.length > 0 || statusEvents.length > 0 ? (
                      <div className="space-y-4">
                        {coLineItems.length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                              <History className="w-4 h-4" />
                              Items Changed
                            </h5>
                            <div className="space-y-1.5">
                              {coLineItems.filter(item => {
                                const isModify = item.action_type === 'modify_quantity' || item.action_type === 'modify_price' || item.action_type === 'modify_labor';
                                return !(isModify && item.change_amount === 0);
                              }).map((item) => {
                                const isAdd = item.action_type === 'add';
                                const isRemove = item.action_type === 'remove';
                                const isModifiers = item.action_type === 'modify_modifiers';

                                const amountColor = item.change_amount > 0 ? 'text-green-400' : item.change_amount < 0 ? 'text-red-400' : 'text-gray-400';
                                const amountPrefix = item.change_amount > 0 ? '+' : item.change_amount < 0 ? '-' : '';

                                const rowBg = isAdd
                                  ? 'bg-green-900/20 border-green-700/30'
                                  : isRemove
                                  ? 'bg-red-900/20 border-red-700/30'
                                  : isModifiers
                                  ? 'bg-amber-900/20 border-amber-700/30'
                                  : 'bg-blue-900/20 border-blue-700/30';

                                const badge = isAdd
                                  ? { label: 'Added', color: 'bg-green-500/20 text-green-400' }
                                  : isRemove
                                  ? { label: item.remove_scope === 'parts_only' ? 'Removed (parts only)' : 'Removed', color: 'bg-red-500/20 text-red-400' }
                                  : isModifiers
                                  ? { label: 'Modifiers', color: 'bg-amber-500/20 text-amber-400' }
                                  : item.action_type === 'modify_labor'
                                  ? { label: 'Labor Changed', color: 'bg-orange-500/20 text-orange-400' }
                                  : { label: 'Modified', color: 'bg-blue-500/20 text-blue-400' };

                                return (
                                  <div key={item.id} className={`rounded-lg border px-3 py-2.5 ${rowBg}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
                                            {badge.label}
                                          </span>
                                          {!isModifiers && (
                                            <span className="text-sm font-medium text-gray-200 truncate">
                                              {item.product_name}
                                            </span>
                                          )}
                                          {item.room_name && (
                                            <span className="text-xs text-gray-500 truncate">
                                              {item.room_name}
                                            </span>
                                          )}
                                        </div>

                                        {isAdd && (
                                          <p className="text-xs text-gray-400 mt-1">
                                            {item.new_quantity} x ${item.new_unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            {item.new_labor_total > 0 && (
                                              <span className="ml-2 text-gray-500">+ ${item.new_labor_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} labor</span>
                                            )}
                                          </p>
                                        )}

                                        {isRemove && (
                                          <p className="text-xs text-gray-400 mt-1">
                                            Was: {item.original_quantity} x ${(item.original_unit_price ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            {item.remove_scope === 'parts_only' && item.original_labor_total != null && item.original_labor_total > 0 && (
                                              <span className="ml-2 text-gray-500">(labor retained)</span>
                                            )}
                                          </p>
                                        )}

                                        {(item.action_type === 'modify_quantity' || item.action_type === 'modify_price') && (
                                          <p className="text-xs text-gray-400 mt-1">
                                            {item.original_quantity} x ${(item.original_unit_price ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            <ArrowRight className="inline w-3 h-3 mx-1.5 text-gray-600" />
                                            {item.new_quantity} x ${item.new_unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        )}

                                        {item.action_type === 'modify_labor' && (
                                          <p className="text-xs text-gray-400 mt-1">
                                            Labor: ${(item.original_labor_total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            <ArrowRight className="inline w-3 h-3 mx-1.5 text-gray-600" />
                                            ${item.new_labor_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            {item.labor_hours != null && item.labor_rate != null && (
                                              <span className="ml-2 text-gray-500">({item.labor_hours}h @ ${item.labor_rate}/hr)</span>
                                            )}
                                          </p>
                                        )}

                                        {isModifiers && item.modifier_adjustments && item.modifier_adjustments.length > 0 && (
                                          <div className="mt-1.5 space-y-0.5">
                                            {item.modifier_adjustments.map((adj, i) => (
                                              <p key={i} className="text-xs text-gray-400">
                                                <span className="text-gray-300">{adj.label}:</span>{' '}
                                                {adj.old_value}%
                                                <ArrowRight className="inline w-3 h-3 mx-1.5 text-gray-600" />
                                                {adj.new_value}%
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {!isModifiers && (
                                        <span className={`text-sm font-semibold flex-shrink-0 ${amountColor}`}>
                                          {amountPrefix}${Math.abs(item.change_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {statusEvents.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Status Timeline</h5>
                            <div className="relative pl-6 space-y-0">
                              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-700" />
                              {statusEvents.map((entry) => {
                                const EntryIcon = getHistoryIcon(entry.action);
                                return (
                                  <div key={entry.id} className="relative flex items-start gap-3 pb-3">
                                    <div className={`absolute -left-6 mt-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                                      entry.action === 'created' ? 'bg-green-500/20' :
                                      entry.action === 'status_changed' ? 'bg-blue-500/20' :
                                      entry.action === 'deleted' ? 'bg-red-500/20' : 'bg-gray-700'
                                    }`}>
                                      <EntryIcon className={`w-3 h-3 ${
                                        entry.action === 'created' ? 'text-green-400' :
                                        entry.action === 'status_changed' ? 'text-blue-400' :
                                        entry.action === 'deleted' ? 'text-red-400' : 'text-gray-400'
                                      }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-gray-300">{entry.description}</p>
                                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                        {entry.performer?.full_name && <span>{entry.performer.full_name}</span>}
                                        <span title={new Date(entry.created_at).toLocaleString()}>
                                          {relativeTime(entry.created_at)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : historyData ? (
                      <div className="text-sm text-gray-500 text-center py-4">
                        No changes recorded yet.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateChangeOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        salesOrderId={order.id}
        onSuccess={async (newId) => {
          setShowCreateModal(false);
          if (newId) {
            await supabase.from('change_orders').update({ is_active: false }).eq('sales_order_id', order.id);
            await supabase.from('change_orders').update({ is_active: true }).eq('id', newId);
            setInlineEditorCOId(newId);
            onRefresh();
          } else {
            onRefresh();
          }
        }}
      />

      {selectedCOId && (
        <ChangeOrderApprovalModal
          isOpen={showApprovalModal}
          onClose={() => { setShowApprovalModal(false); setSelectedCOId(''); }}
          changeOrderId={selectedCOId}
          onSuccess={() => { setShowApprovalModal(false); setSelectedCOId(''); onRefresh(); }}
        />
      )}

      {selectedFlowCO && (
        <ChangeOrderApprovalFlowModal
          isOpen={showFlowModal}
          onClose={() => { setShowFlowModal(false); setSelectedFlowCO(null); }}
          changeOrder={{
            id: selectedFlowCO.id,
            change_order_number: selectedFlowCO.change_order_number,
            title: selectedFlowCO.title,
            description: selectedFlowCO.description,
            change_amount: selectedFlowCO.change_amount,
            tax_amount: selectedFlowCO.tax_amount,
            new_contract_total: selectedFlowCO.new_contract_total,
            original_contract_amount: selectedFlowCO.original_contract_amount,
            status: selectedFlowCO.status,
            sales_order_id: order.id,
            sales_order: {
              order_number: order.order_number,
              contact: order.contact ? { full_name: order.contact.full_name, email: order.contact.email } : undefined,
            },
          }}
          onSuccess={() => { setShowFlowModal(false); setSelectedFlowCO(null); setInlineEditorCOId(null); onRefresh(); }}
        />
      )}

      {transferCO && (
        <TransferChangeOrderModal
          isOpen={true}
          onClose={() => setTransferCO(null)}
          changeOrder={transferCO}
          salesOrderNumber={order.order_number}
          contactName={order.contact?.full_name || ''}
          onSuccess={(newProposalId) => {
            setTransferCO(null);
            setTransferredProposalId(newProposalId);
            onRefresh();
          }}
        />
      )}

      {reportCO && (
        <ChangeOrderReportModal
          co={reportCO}
          order={order}
          onClose={() => setReportCO(null)}
        />
      )}

      {productReportCO && (
        <ChangeOrderProductReportModal
          co={productReportCO}
          order={order}
          onClose={() => setProductReportCO(null)}
        />
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const textColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-semibold ${textColor}`}>{value}</div>
    </div>
  );
}
