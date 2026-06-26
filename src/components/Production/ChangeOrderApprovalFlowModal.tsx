import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import {
  X, CheckCircle, Mail, Globe, DollarSign, FileText, AlertCircle,
  Building2, Users, ChevronRight, Send, ExternalLink, Copy, Check,
  Shield, CreditCard, UserCheck, Clock, Banknote
} from 'lucide-react';

interface ChangeOrderSummary {
  id: string;
  change_order_number: string;
  title: string;
  description?: string;
  change_amount: number;
  tax_amount: number;
  new_contract_total: number;
  original_contract_amount: number;
  status: string;
  sales_order_id: string;
  sales_order?: {
    order_number: string;
    contact?: { full_name: string; email?: string };
  };
}

interface ChangeOrderApprovalFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeOrder: ChangeOrderSummary;
  onSuccess: () => void;
}

type ApprovalPath = 'billing' | 'select' | 'manual' | 'manual_confirm' | 'manual_done' | 'email' | 'portal';

export function ChangeOrderApprovalFlowModal({
  isOpen,
  onClose,
  changeOrder,
  onSuccess,
}: ChangeOrderApprovalFlowModalProps) {
  const { profile } = useAuth();
  const [path, setPath] = useState<ApprovalPath>('select');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portalLink, setPortalLink] = useState('');
  const [approvalTimestamp, setApprovalTimestamp] = useState<Date | null>(null);

  const [isBillable, setIsBillable] = useState(true);
  const [billableType, setBillableType] = useState<'internal' | 'external'>('internal');
  const [showOnReport, setShowOnReport] = useState(false);
  const [notes, setNotes] = useState('');

  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  const [requiresDeposit, setRequiresDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  useEffect(() => {
    if (isOpen && changeOrder) {
      setPath('billing');
      setIsBillable(true);
      setBillableType('internal');
      setShowOnReport(false);
      setNotes('');
      setCopied(false);
      setPortalLink('');
      setRequiresDeposit(false);
      setDepositAmount('');
      setApprovalTimestamp(null);

      const contact = changeOrder.sales_order?.contact;
      setEmailTo(contact?.email || '');
      setEmailSubject(`Change Order ${changeOrder.change_order_number} — Your Approval Needed`);
      setEmailMessage(
        `Dear ${contact?.full_name || 'Valued Customer'},\n\n` +
        `Please review the attached Change Order ${changeOrder.change_order_number}: "${changeOrder.title}".\n\n` +
        `This change order ${changeOrder.change_amount >= 0 ? 'adds' : 'reduces'} ${formatCurrency(Math.abs(changeOrder.change_amount))} to your contract, bringing the new total to ${formatCurrency(changeOrder.new_contract_total)}.\n\n` +
        `Please review the details and contact us with any questions.\n\nThank you`
      );
      setEmailCc('');
    }
  }, [isOpen, changeOrder]);

  async function submitForApproval(method: 'manual' | 'email' | 'portal') {
    setLoading(true);
    try {
      const totalChange = changeOrder.change_amount;

      await supabase.from('change_orders').update({
        status: 'pending_approval',
        is_active: false,
        customer_approval_method: method,
        requires_customer_approval: method !== 'manual',
      }).eq('id', changeOrder.id);

      const approvals: any[] = [];
      approvals.push({
        change_order_id: changeOrder.id,
        approval_level: 1,
        approver_role: 'project_manager',
        status: 'pending',
        required: true,
      });

      if (Math.abs(totalChange) >= 500) {
        approvals.push({
          change_order_id: changeOrder.id,
          approval_level: 2,
          approver_role: 'office_manager',
          status: 'pending',
          required: true,
        });
      }

      if (method === 'email' || method === 'portal') {
        approvals.push({
          change_order_id: changeOrder.id,
          approval_level: 3,
          approver_role: 'customer',
          status: 'pending',
          required: true,
        });
      }

      const existingApprovals = await supabase
        .from('change_order_approvals')
        .select('id')
        .eq('change_order_id', changeOrder.id);

      if (!existingApprovals.data || existingApprovals.data.length === 0) {
        await supabase.from('change_order_approvals').insert(approvals);
      }

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async function handleManualApprove() {
    setLoading(true);
    const now = new Date();
    try {
      const approverName = profile?.full_name || profile?.username || 'Unknown';
      const updates: any = {
        status: 'approved',
        is_active: false,
        is_locked: true,
        approved_by: profile?.id,
        approved_by_name: approverName,
        approval_date: now.toISOString(),
        approval_notes: notes.trim() || null,
        is_billable: isBillable,
        show_on_report: isBillable ? true : (billableType === 'external' ? showOnReport : false),
      };

      const { error: updateError } = await supabase.from('change_orders').update(updates).eq('id', changeOrder.id);
      if (updateError) throw new Error(`Failed to update change order: ${updateError.message}`);

      if (isBillable && changeOrder.sales_order_id) {
        await supabase.from('sales_orders').update({
          contract_total: changeOrder.new_contract_total,
        }).eq('id', changeOrder.sales_order_id);
      }

      // Apply the CO line item changes to the proposal (lock it in)
      const { error: applyError } = await supabase.rpc('apply_change_order', {
        p_change_order_id: changeOrder.id,
      });
      if (applyError) console.error('apply_change_order error:', applyError);

      // Trigger the parent refresh immediately so the list shows locked state
      onSuccess();

      setApprovalTimestamp(now);
      setPath('manual_done');
    } catch (err) {
      console.error(err);
      alert('Failed to approve change order');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSend() {
    if (!emailTo) {
      alert('Please enter a recipient email address');
      return;
    }

    const ok = await submitForApproval('email');
    if (!ok) {
      alert('Failed to update change order status');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('send-change-order-email', {
        body: {
          changeOrderId: changeOrder.id,
          toEmail: emailTo,
          ccEmails: emailCc.split(',').map((e: string) => e.trim()).filter(Boolean),
          subject: emailSubject,
          message: emailMessage,
        },
      });

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || String(err);
      if (msg.includes('not found') || msg.includes('FunctionNotFound') || msg.includes('404')) {
        onSuccess();
        onClose();
      } else {
        alert('Failed to send email: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePortalSend() {
    const ok = await submitForApproval('portal');
    if (!ok) {
      alert('Failed to update change order status');
      setLoading(false);
      return;
    }

    try {
      const token = crypto.randomUUID();
      await supabase.from('change_orders').update({
        customer_approval_token: token,
        customer_approval_sent_at: new Date().toISOString(),
        requires_deposit: requiresDeposit,
        deposit_amount: requiresDeposit && depositAmount ? parseFloat(depositAmount) : null,
      }).eq('id', changeOrder.id);

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/portal/change-order/${token}`;
      setPortalLink(link);
      setPath('portal');
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate portal link: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(portalLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) return null;

  const customerName = changeOrder.sales_order?.contact?.full_name || 'Customer';
  const changePositive = changeOrder.change_amount >= 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const approverName = profile?.full_name || profile?.username || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Approve Change Order</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {changeOrder.change_order_number} &mdash; {changeOrder.title}
            </p>
          </div>
          {path !== 'manual_done' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Financial summary strip */}
          <div className="px-6 py-3 bg-gray-900 text-white flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="text-gray-400">Change</span>
              <span className={`ml-2 font-bold ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
                {changePositive ? '+' : ''}${fmt(changeOrder.change_amount)}
              </span>
            </div>
            <div className="text-gray-600">|</div>
            <div>
              <span className="text-gray-400">New Total</span>
              <span className="ml-2 font-bold text-white">${fmt(changeOrder.new_contract_total)}</span>
            </div>
            <div className="text-gray-600">|</div>
            <div>
              <span className="text-gray-400">Customer</span>
              <span className="ml-2 font-medium text-gray-200">{customerName}</span>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Step 1 — Billing classification (always first) */}
            {path === 'billing' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Step 1 of 2 — Billing Classification</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Is this change order billable to the customer?</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBillable(true)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      isBillable
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <Banknote className={`w-6 h-6 ${isBillable ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${isBillable ? 'text-green-800' : 'text-gray-600'}`}>Billable</span>
                    <span className="text-xs text-gray-400 text-center leading-tight">Customer is charged · contract total updates</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBillable(false)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      !isBillable
                        ? 'border-gray-700 bg-gray-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <Shield className={`w-6 h-6 ${!isBillable ? 'text-gray-700' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${!isBillable ? 'text-gray-800' : 'text-gray-600'}`}>Non-Billable</span>
                    <span className="text-xs text-gray-400 text-center leading-tight">No charge · internal or external</span>
                  </button>
                </div>

                {!isBillable && (
                  <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Non-Billable Type</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setBillableType('internal'); setShowOnReport(false); }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${billableType === 'internal' ? 'border-gray-700 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <Building2 className={`w-5 h-5 ${billableType === 'internal' ? 'text-gray-800' : 'text-gray-400'}`} />
                        <span className={`text-xs font-semibold ${billableType === 'internal' ? 'text-gray-800' : 'text-gray-500'}`}>Internal / Private</span>
                        <span className="text-xs text-gray-400 text-center leading-tight">Hidden from customer reports</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBillableType('external'); setShowOnReport(true); }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${billableType === 'external' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <Users className={`w-5 h-5 ${billableType === 'external' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`text-xs font-semibold ${billableType === 'external' ? 'text-blue-700' : 'text-gray-500'}`}>External / Public</span>
                        <span className="text-xs text-gray-400 text-center leading-tight">Shown to customer, no charge</span>
                      </button>
                    </div>
                  </div>
                )}

                {isBillable && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-800">
                      Approving as billable will update the contract total to <strong>${fmt(changeOrder.new_contract_total)}</strong>.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setPath('select')}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold transition-colors"
                >
                  Next — Choose Approval Method
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2 — Path selection */}
            {path === 'select' && (
              <div className="space-y-4">
                <button onClick={() => setPath('billing')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back
                </button>

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
                  <span className="text-gray-500">Billing:</span>
                  <span className={`font-semibold ${isBillable ? 'text-green-700' : 'text-gray-700'}`}>
                    {isBillable ? 'Billable' : `Non-Billable (${billableType === 'internal' ? 'Private' : 'Public'})`}
                  </span>
                  <button onClick={() => setPath('billing')} className="ml-auto text-xs text-blue-600 hover:underline">Change</button>
                </div>

                <p className="text-sm text-gray-600">Step 2 of 2 — How would you like to handle approval?</p>

                <div className="grid gap-3">
                  {/* Manual approve — most prominent, first */}
                  <button
                    onClick={() => setPath('manual')}
                    className="group flex items-center gap-4 p-4 border-2 border-green-200 bg-green-50 rounded-xl hover:border-green-400 hover:bg-green-100 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-200 group-hover:bg-green-300 flex items-center justify-center flex-shrink-0 transition-colors">
                      <UserCheck className="w-5 h-5 text-green-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">Approve Internally</p>
                        <span className="px-2 py-0.5 text-xs font-semibold bg-green-200 text-green-800 rounded-full">Recommended</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">No customer approval needed. Records date, time, and approver immediately.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition-colors flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setPath('email')}
                    className="group flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Mail className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">Email to Customer</p>
                      <p className="text-sm text-gray-500">Send the change order PDF to the customer for their review and approval.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setPath('portal')}
                    className="group flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-100 group-hover:bg-orange-200 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Globe className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">Send to Customer Portal</p>
                      <p className="text-sm text-gray-500">Generate a portal link for customer to review, approve, and optionally pay a deposit.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* Manual approve — confirm & notes step */}
            {path === 'manual' && (
              <div className="space-y-5">
                <button onClick={() => setPath('select')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back
                </button>

                {/* Approver identity card */}
                <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Approving as</p>
                    <p className="font-semibold text-gray-900">{approverName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Date &amp; Time</p>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Billing summary (read-only, links back) */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
                  <span className="text-gray-500">Billing:</span>
                  <span className={`font-semibold ${isBillable ? 'text-green-700' : 'text-gray-700'}`}>
                    {isBillable ? 'Billable' : `Non-Billable (${billableType === 'internal' ? 'Private' : 'Public'})`}
                  </span>
                  <button onClick={() => setPath('billing')} className="ml-auto text-xs text-blue-600 hover:underline">Change</button>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Reason for approval, scope context, verbal authorization details..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {isBillable && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-800">
                      Approving as billable will update the contract total to <strong>${fmt(changeOrder.new_contract_total)}</strong>.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleManualApprove}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <CheckCircle className="w-5 h-5" />
                  }
                  {loading ? 'Recording Approval...' : 'Approve Change Order'}
                </button>
              </div>
            )}

            {/* Manual approve — success/stamp screen */}
            {path === 'manual_done' && approvalTimestamp && (
              <div className="space-y-5">
                {/* Success header */}
                <div className="flex flex-col items-center text-center pt-2 pb-1">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
                    <CheckCircle className="w-9 h-9 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Change Order Approved</h3>
                  <p className="text-sm text-gray-500 mt-1">{changeOrder.change_order_number} &mdash; {changeOrder.title}</p>
                </div>

                {/* Approval stamp card */}
                <div className="border-2 border-green-200 bg-green-50 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-bold text-green-800 uppercase tracking-wide">Approval Record</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-green-700/70 uppercase tracking-wide font-medium">Approved By</p>
                      <p className="font-semibold text-green-900">{approverName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-700/70 uppercase tracking-wide font-medium">Date &amp; Time</p>
                      <p className="font-semibold text-green-900">
                        {approvalTimestamp.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-green-700/70 uppercase tracking-wide font-medium">Billing</p>
                      <p className="font-semibold text-green-900">
                        {isBillable ? 'Billable' : `Non-Billable (${billableType})`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-green-700/70 uppercase tracking-wide font-medium">Method</p>
                      <p className="font-semibold text-green-900">Internal / Manual</p>
                    </div>
                  </div>

                  {notes.trim() && (
                    <div className="pt-2 border-t border-green-200">
                      <p className="text-xs text-green-700/70 uppercase tracking-wide font-medium mb-1">Notes</p>
                      <p className="text-sm text-green-900">{notes.trim()}</p>
                    </div>
                  )}
                </div>

                {/* Financial impact */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Impact</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Change amount</span>
                    <span className={`font-semibold ${changePositive ? 'text-green-600' : 'text-red-600'}`}>
                      {changePositive ? '+' : ''}${fmt(changeOrder.change_amount)}
                    </span>
                  </div>
                  {isBillable && (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                      <span className="text-gray-700 font-medium">New contract total</span>
                      <span className="font-bold text-gray-900">${fmt(changeOrder.new_contract_total)}</span>
                    </div>
                  )}
                  {!isBillable && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      Contract total was not updated — non-billable change order.
                    </div>
                  )}
                </div>

                <button
                  onClick={onClose}
                  className="w-full px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Email path */}
            {path === 'email' && (
              <div className="space-y-5">
                <button onClick={() => setPath('select')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back
                </button>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Email to Customer for Approval</h3>
                  </div>
                  <p className="text-sm text-blue-700">The change order will be sent as a PDF. Once the customer approves you can manually approve it here.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CC (optional, comma-separated)</label>
                    <input
                      type="text"
                      value={emailCc}
                      onChange={e => setEmailCc(e.target.value)}
                      placeholder="cc@example.com, another@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <textarea
                      value={emailMessage}
                      onChange={e => setEmailMessage(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </div>

                <button
                  onClick={handleEmailSend}
                  disabled={loading || !emailTo}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                  {loading ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            )}

            {/* Portal path — configuration step */}
            {path === 'portal' && !portalLink && (
              <div className="space-y-5">
                <button onClick={() => setPath('select')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back
                </button>

                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-5 h-5 text-orange-600" />
                    <h3 className="font-semibold text-orange-900">Send to Customer Portal</h3>
                  </div>
                  <p className="text-sm text-orange-700">Generate a secure link where the customer can review and approve the change order.</p>
                </div>

                <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <CreditCard className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Require deposit</p>
                        <p className="text-xs text-gray-500">Customer must pay a deposit before approval is confirmed</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRequiresDeposit(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${requiresDeposit ? 'bg-orange-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${requiresDeposit ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {requiresDeposit && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Amount ($)</label>
                      <div className="relative">
                        <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={e => setDepositAmount(e.target.value)}
                          placeholder={`e.g. ${formatCurrency(changeOrder.change_amount * 0.5)}`}
                          min="0"
                          step="0.01"
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-gray-50 rounded-lg flex items-start gap-2">
                  <Shield className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">A unique secure link will be generated. Share it with the customer via email or text. The link expires when the CO is approved or rejected.</p>
                </div>

                <button
                  onClick={handlePortalSend}
                  disabled={loading || (requiresDeposit && !depositAmount)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  <ExternalLink className="w-5 h-5" />
                  {loading ? 'Generating...' : 'Generate Portal Link'}
                </button>
              </div>
            )}

            {/* Portal link generated */}
            {path === 'portal' && portalLink && (
              <div className="space-y-5">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">Portal link generated!</p>
                    <p className="text-sm text-green-700">Share this link with {customerName}. They can review and approve the change order.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer Approval Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={portalLink}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700 font-mono"
                    />
                    <button
                      onClick={copyLink}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${copied ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {requiresDeposit && depositAmount && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-orange-600" />
                    <p className="text-sm text-orange-800">Deposit required: <strong>{formatCurrency(parseFloat(depositAmount))}</strong></p>
                  </div>
                )}

                <button
                  onClick={() => { onSuccess(); onClose(); }}
                  className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>

        {(path === 'billing' || path === 'select') && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
