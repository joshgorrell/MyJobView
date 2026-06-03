import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, CheckCircle, XCircle, AlertCircle, FileText, DollarSign, User, Clock, EyeOff, Building2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface ModifierAdjustment {
  label: string;
  field: string;
  old_value: number;
  new_value: number;
}

interface LineItem {
  id: string;
  action_type: string;
  product_name: string;
  item_type?: string;
  new_quantity: number;
  new_unit_price: number;
  new_total?: number;
  new_labor_total?: number;
  labor_hours?: number;
  labor_rate?: number;
  labor_phase_id?: string;
  change_amount: number;
  install_location?: string;
  room_name?: string;
  labor_phase?: { name: string } | null;
  modifier_adjustments?: ModifierAdjustment[] | null;
}

interface Approval {
  id: string;
  approval_level: number;
  approver_role: string;
  approver_id?: string;
  status: string;
  approved_date?: string;
  rejection_reason?: string;
  notes?: string;
  required: boolean;
  approver?: {
    full_name: string;
  };
}

interface ChangeOrder {
  id: string;
  change_order_number: string;
  revision_number: number;
  title: string;
  description: string;
  internal_notes?: string;
  reason: string;
  type: string;
  status: string;
  is_billable: boolean;
  show_on_report: boolean;
  original_contract_amount: number;
  change_amount: number;
  tax_amount: number;
  new_contract_total: number;
  requires_customer_approval: boolean;
  created_at: string;
  sales_order_id: string;
  sales_order?: {
    order_number: string;
    contact?: {
      full_name: string;
    };
  };
  requester?: {
    full_name: string;
  };
}

interface ChangeOrderApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeOrderId: string;
  onSuccess: () => void;
}

export function ChangeOrderApprovalModal({ isOpen, onClose, changeOrderId, onSuccess }: ChangeOrderApprovalModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [changeOrder, setChangeOrder] = useState<ChangeOrder | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [billableType, setBillableType] = useState<'internal' | 'external'>('internal');
  const [showOnReport, setShowOnReport] = useState(true);
  const [confirmApproveId, setConfirmApproveId] = useState<{ approvalId: string; level: number } | null>(null);
  const [portalGuard, setPortalGuard] = useState<{ approvalId: string; level: number; proposalId: string } | null>(null);

  useEffect(() => {
    if (isOpen && changeOrderId) {
      loadChangeOrder();
      loadLineItems();
      loadApprovals();
    }
  }, [isOpen, changeOrderId]);

  useEffect(() => {
    if (changeOrder) {
      setIsBillable(changeOrder.is_billable ?? true);
      setBillableType((changeOrder as any).billable_type ?? 'internal');
      setShowOnReport(changeOrder.show_on_report ?? true);
    }
  }, [changeOrder]);

  async function loadChangeOrder() {
    try {
      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          *,
          sales_order_id,
          sales_order:sales_orders(
            order_number,
            contact:contacts(full_name)
          ),
          requester:profiles!change_orders_requested_by_fkey(full_name)
        `)
        .eq('id', changeOrderId)
        .single();

      if (error) throw error;
      setChangeOrder(data);
    } catch (error) {
      console.error('Error loading change order:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLineItems() {
    try {
      const { data, error } = await supabase
        .from('change_order_line_items')
        .select(`
          *,
          labor_phase:labor_phases(name)
        `)
        .eq('change_order_id', changeOrderId)
        .order('sort_order');

      if (error) throw error;
      setLineItems(data || []);
    } catch (error) {
      console.error('Error loading line items:', error);
    }
  }

  async function loadApprovals() {
    try {
      const { data, error } = await supabase
        .from('change_order_approvals')
        .select(`
          *,
          approver:profiles(full_name)
        `)
        .eq('change_order_id', changeOrderId)
        .order('approval_level');

      if (error) throw error;
      setApprovals(data || []);
    } catch (error) {
      console.error('Error loading approvals:', error);
    }
  }

  async function handleApprove(approvalId: string, level: number) {
    if (!profile) return;

    setLoading(true);
    try {
      const { error: appError } = await supabase
        .from('change_order_approvals')
        .update({
          status: 'approved',
          approver_id: profile.id,
          approved_date: new Date().toISOString(),
          notes
        })
        .eq('id', approvalId);

      if (appError) throw appError;

      const { data: pendingApprovals, error: checkError } = await supabase
        .from('change_order_approvals')
        .select('id')
        .eq('change_order_id', changeOrderId)
        .eq('required', true)
        .eq('status', 'pending');

      if (checkError) throw checkError;

      if (!pendingApprovals || pendingApprovals.length === 0) {
        // Final approval — check if the linked proposal is currently live on the portal
        const { data: soData } = await supabase
          .from('sales_orders')
          .select('proposal_id')
          .eq('id', changeOrder!.sales_order_id)
          .maybeSingle();

        const proposalId = soData?.proposal_id;
        if (proposalId) {
          const { data: propData } = await supabase
            .from('proposals')
            .select('is_portal_visible')
            .eq('id', proposalId)
            .maybeSingle();

          if (propData?.is_portal_visible) {
            // Portal is live — pause and ask before applying changes
            setLoading(false);
            setPortalGuard({ approvalId, level, proposalId });
            return;
          }
        }

        await finalizeApproval(proposalId ?? null);
      } else {
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Error approving change order:', error);
      alert('Failed to approve change order');
    } finally {
      setLoading(false);
    }
  }

  async function finalizeApproval(proposalId: string | null, hidePortal = false) {
    setLoading(true);
    try {
      if (hidePortal && proposalId) {
        await supabase
          .from('proposals')
          .update({ is_portal_visible: false })
          .eq('id', proposalId);
      }

      const { error: coError } = await supabase
        .from('change_orders')
        .update({
          status: 'approved',
          is_active: false,
          approved_by: profile!.id,
          approval_date: new Date().toISOString(),
          is_billable: isBillable,
          billable_type: isBillable ? null : billableType,
          show_on_report: isBillable ? true : (billableType === 'external' ? showOnReport : false)
        })
        .eq('id', changeOrderId);

      if (coError) throw coError;

      if (changeOrder?.sales_order_id && isBillable) {
        const { error: soError } = await supabase
          .from('sales_orders')
          .update({ contract_total: changeOrder.new_contract_total })
          .eq('id', changeOrder.sales_order_id);

        if (soError) throw soError;
      }

      // Apply the CO line item changes to the proposal (lock it in)
      const { error: applyError } = await supabase.rpc('apply_change_order', {
        p_change_order_id: changeOrderId,
      });
      if (applyError) console.error('apply_change_order error:', applyError);

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error finalizing change order approval:', error);
      alert('Failed to approve change order');
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(approvalId: string) {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setLoading(true);
    try {
      const { error: appError } = await supabase
        .from('change_order_approvals')
        .update({
          status: 'rejected',
          approver_id: profile?.id,
          approved_date: new Date().toISOString(),
          rejection_reason: rejectionReason,
          notes
        })
        .eq('id', approvalId);

      if (appError) throw appError;

      // Use the RPC so it also restores is_hidden=false on any removed line items
      const { error: coError } = await supabase.rpc('reject_change_order', {
        p_change_order_id: changeOrderId,
        p_rejection_reason: rejectionReason,
      });

      if (coError) throw coError;

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error rejecting change order:', error);
      alert('Failed to reject change order');
    } finally {
      setLoading(false);
    }
  }

  function canApproveLevel(approval: Approval): boolean {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    const roleMap: { [key: string]: string[] } = {
      'project_manager': ['project_manager', 'production_manager'],
      'office_manager': ['office_manager'],
      'admin': ['admin']
    };
    const allowedRoles = roleMap[approval.approver_role] || [];
    return allowedRoles.includes(profile.role);
  }

  function getApprovalStatusColor(status: string) {
    switch (status) {
      case 'approved': return 'text-green-600 bg-green-50 border-green-200';
      case 'rejected': return 'text-red-600 bg-red-50 border-red-200';
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  }

  if (!isOpen || !changeOrder) return null;

  const currentApproval = approvals.find(a => a.status === 'pending' && canApproveLevel(a));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Change Order Approval</h2>
            <p className="text-sm text-gray-600 mt-1">{changeOrder.change_order_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Overview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{changeOrder.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Customer:</span>
                <span className="ml-2 font-medium">{changeOrder.sales_order?.contact?.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Sales Order:</span>
                <span className="ml-2 font-medium">{changeOrder.sales_order?.order_number}</span>
              </div>
              <div>
                <span className="text-gray-600">Type:</span>
                <span className="ml-2 font-medium capitalize">{changeOrder.type}</span>
              </div>
              <div>
                <span className="text-gray-600">Requested By:</span>
                <span className="ml-2 font-medium">{changeOrder.requester?.full_name}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {changeOrder.description && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Description</h4>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{changeOrder.description}</p>
            </div>
          )}

          {/* Internal Notes */}
          {changeOrder.internal_notes && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Internal Notes</h4>
              <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded border border-yellow-200">
                {changeOrder.internal_notes}
              </p>
            </div>
          )}

          {/* Line Items */}
          <div>
            {(() => {
              const regularItems = lineItems.filter(i => {
                if (i.action_type === 'modify_modifiers') return false;
                const isModify = i.action_type === 'modify_quantity' || i.action_type === 'modify_price' || i.action_type === 'modify_labor';
                if (isModify && (i.change_amount ?? 0) === 0) return false;
                return true;
              });
              const modifierRecord = lineItems.find(i => i.action_type === 'modify_modifiers');
              return (
                <>
                  {regularItems.length > 0 && (
                    <>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Line Items ({regularItems.length})
                      </h4>
                      <div className="space-y-2">
                        {regularItems.map(item => {
                          const hasLabor = (item.labor_hours ?? 0) > 0 || (item.new_labor_total ?? 0) > 0;
                          const actionLabel = item.action_type === 'modify_labor' ? 'labor change' : item.action_type.replace('_', ' ');
                          return (
                            <div key={item.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      item.action_type === 'add' ? 'bg-green-100 text-green-700' :
                                      item.action_type === 'remove' ? 'bg-red-100 text-red-700' :
                                      item.action_type === 'modify_labor' ? 'bg-orange-100 text-orange-700' :
                                      'bg-blue-100 text-blue-700'
                                    }`}>
                                      {actionLabel}
                                    </span>
                                    {item.item_type && item.item_type !== 'material' && (
                                      <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600">
                                        {item.item_type}
                                      </span>
                                    )}
                                    <span className="font-medium text-gray-900 truncate">{item.product_name}</span>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1.5 space-y-0.5">
                                    {(item.item_type === 'material' || item.item_type === 'both' || !item.item_type) && (
                                      <div>Qty: {item.new_quantity} × ${(item.new_unit_price ?? 0).toFixed(2)} = ${((item.new_quantity ?? 0) * (item.new_unit_price ?? 0)).toFixed(2)}</div>
                                    )}
                                    {hasLabor && (
                                      <div className="text-orange-700">
                                        <span>Labor: {item.labor_hours ?? 0} hrs @ ${(item.labor_rate ?? 0).toFixed(2)}/hr = ${(item.new_labor_total ?? 0).toFixed(2)}</span>
                                        {item.labor_phase?.name && (
                                          <span className="ml-2 text-gray-500">• Phase: {item.labor_phase.name}</span>
                                        )}
                                      </div>
                                    )}
                                    {item.room_name && (
                                      <div className="text-gray-500">Area: {item.room_name}</div>
                                    )}
                                    {item.install_location && (
                                      <div className="text-gray-500">Location: {item.install_location}</div>
                                    )}
                                  </div>
                                </div>
                                <div className={`font-semibold ml-4 whitespace-nowrap ${(item.change_amount ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {(item.change_amount ?? 0) > 0 ? '+' : (item.change_amount ?? 0) < 0 ? '-' : ''}${Math.abs(item.change_amount ?? 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {modifierRecord?.modifier_adjustments && modifierRecord.modifier_adjustments.length > 0 && (
                    <div className={regularItems.length > 0 ? 'mt-4' : ''}>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-600" />
                        Modifier Adjustments
                      </h4>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                        {modifierRecord.modifier_adjustments.map((adj, i) => {
                          const wasOff = adj.old_value === 0;
                          const isOff = adj.new_value === 0;
                          return (
                            <div key={i} className={`flex justify-between items-center px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-amber-200' : ''}`}>
                              <span className="text-gray-700 font-medium">{adj.label}:</span>
                              <span className="flex items-center gap-2 tabular-nums">
                                {wasOff
                                  ? <span className="text-gray-400 line-through text-xs">off</span>
                                  : <span className="text-gray-500">{adj.old_value}%</span>
                                }
                                <span className="text-gray-400 text-xs">→</span>
                                {isOff
                                  ? <span className="text-red-600 font-semibold">off</span>
                                  : <span className={`font-semibold ${adj.new_value > adj.old_value ? 'text-amber-700' : 'text-emerald-600'}`}>
                                      {adj.new_value}%
                                    </span>
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Financial Summary */}
          <div className="bg-gray-900 text-white rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Financial Impact
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Current Contract Total:</span>
                <span className="font-medium">${(changeOrder.original_contract_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Change Amount:</span>
                <span className={(changeOrder.change_amount ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {(changeOrder.change_amount ?? 0) >= 0 ? '+' : '−'}${Math.abs(changeOrder.change_amount ?? 0).toFixed(2)}
                </span>
              </div>
              {(changeOrder.tax_amount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>Sales Tax:</span>
                  <span>+${(changeOrder.tax_amount ?? 0).toFixed(2)}</span>
                </div>
              )}
              <div className="h-px bg-gray-700 my-2" />
              <div className="flex justify-between text-xl">
                <span className="font-bold">New Contract Total:</span>
                <span className="font-bold">${(changeOrder.new_contract_total ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Approval Workflow */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Approval Workflow
            </h4>
            <div className="space-y-3">
              {approvals.map((approval) => (
                <div
                  key={approval.id}
                  className={`p-4 rounded-lg border ${getApprovalStatusColor(approval.status)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Level {approval.approval_level}</span>
                        <span>•</span>
                        <span className="capitalize">{approval.approver_role.replace('_', ' ')}</span>
                        {approval.required && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Required</span>
                        )}
                      </div>
                      {approval.approver && (
                        <p className="text-sm mt-1">
                          <User className="w-4 h-4 inline mr-1" />
                          {approval.approver.full_name}
                        </p>
                      )}
                      {approval.approved_date && (
                        <p className="text-xs mt-1">
                          {new Date(approval.approved_date).toLocaleString()}
                        </p>
                      )}
                      {approval.rejection_reason && (
                        <p className="text-sm mt-2 p-2 bg-white rounded">
                          <span className="font-medium">Reason:</span> {approval.rejection_reason}
                        </p>
                      )}
                      {approval.notes && (
                        <p className="text-sm mt-2 p-2 bg-white rounded">
                          <span className="font-medium">Notes:</span> {approval.notes}
                        </p>
                      )}
                    </div>
                    <div className="ml-4">
                      {approval.status === 'approved' && <CheckCircle className="w-6 h-6 text-green-600" />}
                      {approval.status === 'rejected' && <XCircle className="w-6 h-6 text-red-600" />}
                      {approval.status === 'pending' && <Clock className="w-6 h-6 text-yellow-600" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approval Actions */}
          {currentApproval && changeOrder.status === 'pending_approval' && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900">Your approval is required</p>
                  <p className="text-sm text-yellow-800">
                    You can approve or reject this change order at Level {currentApproval.approval_level}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Billable toggle */}
                <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Billing Classification</p>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Billable to customer</p>
                      <p className="text-xs text-gray-500">
                        {isBillable
                          ? 'Customer will be charged for this change order'
                          : 'Customer will NOT be charged'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBillable(v => !v);
                        if (isBillable) setShowOnReport(false);
                        else setShowOnReport(true);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isBillable ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        isBillable ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {!isBillable && (
                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Non-Billable Type</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setBillableType('internal'); setShowOnReport(false); }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-left ${
                            billableType === 'internal'
                              ? 'border-gray-700 bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Building2 className={`w-5 h-5 ${billableType === 'internal' ? 'text-gray-800' : 'text-gray-400'}`} />
                          <span className={`text-xs font-semibold ${billableType === 'internal' ? 'text-gray-800' : 'text-gray-500'}`}>Internal</span>
                          <span className="text-xs text-gray-400 text-center leading-tight">Hidden from customer entirely</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBillableType('external'); setShowOnReport(true); }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-left ${
                            billableType === 'external'
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Users className={`w-5 h-5 ${billableType === 'external' ? 'text-blue-600' : 'text-gray-400'}`} />
                          <span className={`text-xs font-semibold ${billableType === 'external' ? 'text-blue-700' : 'text-gray-500'}`}>External</span>
                          <span className="text-xs text-gray-400 text-center leading-tight">Shown on reports, no charge</span>
                        </button>
                      </div>

                      {billableType === 'external' && (
                        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <EyeOff className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">Show on customer reports</p>
                              <p className="text-xs text-gray-500">
                                {showOnReport ? 'Visible to customer (no dollar amount)' : 'Hidden from reports'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowOnReport(v => !v)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              showOnReport ? 'bg-blue-500' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              showOnReport ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes or comments..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason (Required if rejecting)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this change order is being rejected..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmApproveId({ approvalId: currentApproval.id, level: currentApproval.approval_level })}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(currentApproval.id)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle className="w-5 h-5" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmApproveId}
        title="Approve Change Order"
        message="Approve this change order?"
        variant="neutral"
        confirmLabel="Approve"
        onConfirm={() => {
          if (confirmApproveId) {
            setConfirmApproveId(null);
            handleApprove(confirmApproveId.approvalId, confirmApproveId.level);
          }
        }}
        onCancel={() => setConfirmApproveId(null)}
      />
      <ConfirmModal
        isOpen={!!portalGuard}
        title="Take portal offline?"
        message="Approving this change order will modify the proposal currently live on the customer portal. The portal will be taken offline so you can review the view before re-publishing. Continue?"
        variant="warning"
        confirmLabel="Approve & Take Offline"
        onConfirm={() => {
          if (portalGuard) {
            const pg = portalGuard;
            setPortalGuard(null);
            finalizeApproval(pg.proposalId, true);
          }
        }}
        onCancel={() => setPortalGuard(null)}
      />
    </div>
  );
}
