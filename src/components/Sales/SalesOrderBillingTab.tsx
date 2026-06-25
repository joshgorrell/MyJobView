import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign, Receipt, CheckCircle, Clock, AlertCircle, Send, CreditCard, Plus,
  Zap, ChevronRight, TrendingUp, TrendingDown, FileText, Layers,
  MoreVertical, Ban, Trash2, Eye, EyeOff, Loader2, CalendarDays
} from 'lucide-react';
import { CreateSOInvoiceModal } from './CreateSOInvoiceModal';
import { RecordPaymentModal } from '../Invoices/RecordPaymentModal';
import { InvoiceDetailModal } from '../Invoices/InvoiceDetailModal';
import { InvoiceTaxReport } from '../Invoices/InvoiceTaxReport';
import ConfirmModal from '../ui/ConfirmModal';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';
import type { TaxEnvironment, TaxProjectType } from '../../lib/taxCalculations';

interface BillingScheduleEntry {
  id: string;
  phase_order: number;
  title: string;
  amount_type: 'percentage' | 'fixed';
  amount: number;
  notes?: string;
  resolvedAmount: number;
  status: 'unbilled' | 'invoiced';
  invoiceId?: string;
  isSynthetic?: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_title: string;
  invoice_date: string;
  due_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  includes_change_orders: boolean;
  source_type: string;
  invoice_type?: string;
  created_at: string;
  created_by_name: string;
  linked_cos?: COLinkDetail[];
  billing_phase_id?: string | null;
}

interface COLinkDetail {
  coNumber: string;
  amountBilled: number;
  fullyBilled: boolean;
  changeOrderId: string;
}

interface SalesOrderBillingTabProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
  onRefresh: () => void;
}

export function SalesOrderBillingTab({ order, changeOrders, onRefresh }: SalesOrderBillingTabProps) {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [preSelectedIds, setPreSelectedIds] = useState<string[]>([]);
  const [billingScheduleAmount, setBillingScheduleAmount] = useState<number | undefined>(undefined);
  const [billingScheduleTitle, setBillingScheduleTitle] = useState<string | undefined>(undefined);
  const [billingSchedulePhaseId, setBillingSchedulePhaseId] = useState<string | undefined>(undefined);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<Invoice | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [billingSchedule, setBillingSchedule] = useState<BillingScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [deleteScheduleConfirm, setDeleteScheduleConfirm] = useState<BillingScheduleEntry | null>(null);
  const [showTaxReport, setShowTaxReport] = useState(false);

  const canDeletePaidInvoices = profile?.role === 'admin' || profile?.can_delete_invoices === true;

  useEffect(() => {
    loadInvoices();
  }, [order.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  async function loadInvoices() {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('sales_order_id', order.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const invoiceIds = (data || []).map(i => i.id);
      let coLinksMap: Record<string, COLinkDetail[]> = {};

      if (invoiceIds.length > 0) {
        const { data: links } = await supabase
          .from('invoice_change_order_links')
          .select('invoice_id, change_order_id, amount_billed, fully_billed')
          .in('invoice_id', invoiceIds);

        (links || []).forEach(link => {
          if (!coLinksMap[link.invoice_id]) coLinksMap[link.invoice_id] = [];
          const co = changeOrders.find(c => c.id === link.change_order_id);
          if (co) {
            coLinksMap[link.invoice_id].push({
              coNumber: co.change_order_number,
              amountBilled: link.amount_billed,
              fullyBilled: link.fully_billed,
              changeOrderId: link.change_order_id,
            });
          }
        });
      }

      const invoiceList = (data || []).map(inv => ({
        ...inv,
        linked_cos: coLinksMap[inv.id] || []
      }));
      setInvoices(invoiceList);

      if (order.proposal_id) {
        await loadBillingSchedule(invoiceList);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadBillingSchedule(currentInvoices: Invoice[]) {
    if (!order.proposal_id) return;
    setScheduleLoading(true);
    try {
      const { data: phases, error } = await supabase
        .from('proposal_billing_phases')
        .select('*')
        .eq('proposal_id', order.proposal_id)
        .order('phase_order');

      if (error) throw error;

      const activeInvoiceList = currentInvoices.filter(inv => inv.status !== 'void');

      if (!phases || phases.length === 0) {
        // No custom billing phases — synthesize deposit + balance rows if a deposit was configured
        const depositAmount = order.proposal?.deposit_amount;
        const proposalTotal = order.proposal?.total;
        if (depositAmount && depositAmount > 0 && proposalTotal && proposalTotal > 0) {
          const balance = proposalTotal - depositAmount;
          // Best-effort: match deposit invoice by title or amount
          const depositInvoice = activeInvoiceList.find(inv => {
            const titleMatch = inv.invoice_title?.toLowerCase().includes('deposit');
            const amountMatch = Math.abs((inv.total || 0) - depositAmount) < 1;
            return titleMatch || amountMatch;
          });
          const balanceInvoice = !depositInvoice && balance > 0
            ? activeInvoiceList.find(inv => Math.abs((inv.total || 0) - balance) < 1)
            : undefined;

          setBillingSchedule([
            {
              id: 'synthetic-deposit',
              phase_order: 1,
              title: 'Deposit',
              amount_type: 'fixed',
              amount: depositAmount,
              resolvedAmount: depositAmount,
              status: depositInvoice ? 'invoiced' : 'unbilled',
              invoiceId: depositInvoice?.id,
              isSynthetic: true,
            },
            {
              id: 'synthetic-balance',
              phase_order: 2,
              title: 'Balance Due',
              amount_type: 'fixed',
              amount: balance,
              resolvedAmount: balance,
              status: balanceInvoice ? 'invoiced' : 'unbilled',
              invoiceId: balanceInvoice?.id,
              isSynthetic: true,
            },
          ]);
        } else {
          setBillingSchedule([]);
        }
        return;
      }

      // Use proposal total (tax-inclusive) as the baseline for percentage phases,
      // matching how DepositConfiguration sets them up.
      const phaseBaseline = order.proposal?.total || order.original_contract_total || order.contract_total || 0;

      const entries: BillingScheduleEntry[] = phases.map(phase => {
        const resolvedAmount = phase.amount_type === 'percentage'
          ? (phaseBaseline * phase.amount) / 100
          : phase.amount;

        // Primary match: billing_phase_id FK (set when invoice is created from a phase)
        const phaseInvoice = activeInvoiceList.find(inv => inv.billing_phase_id === phase.id);

        // Fallback: title/amount match for invoices created before billing_phase_id existed
        const fallbackInvoice = phaseInvoice ? undefined : activeInvoiceList.find(inv => {
          if (inv.billing_phase_id) return false; // already linked to a different phase
          const titleMatch = !!(inv.invoice_title && phase.title &&
            inv.invoice_title.toLowerCase().includes(phase.title.toLowerCase()));
          const amountMatch = Math.abs((inv.total || 0) - resolvedAmount) < 1;
          return titleMatch || amountMatch;
        });

        const linkedInvoice = phaseInvoice || fallbackInvoice;

        return {
          id: phase.id,
          phase_order: phase.phase_order,
          title: phase.title,
          amount_type: phase.amount_type,
          amount: phase.amount,
          notes: phase.notes,
          resolvedAmount,
          status: linkedInvoice ? 'invoiced' : 'unbilled',
          invoiceId: linkedInvoice?.id,
        };
      });

      setBillingSchedule(entries);
    } catch (err) {
      console.error('Error loading billing schedule:', err);
    } finally {
      setScheduleLoading(false);
    }
  }

  async function handleDeleteScheduleEntry(entry: BillingScheduleEntry) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('proposal_billing_phases')
        .delete()
        .eq('id', entry.id);
      if (error) throw error;
      setDeleteScheduleConfirm(null);
      await loadInvoices();
    } catch (err) {
      console.error('Error deleting billing schedule entry:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function reverseCOBillingForInvoice(invoice: Invoice) {
    if (!invoice.linked_cos || invoice.linked_cos.length === 0) return;

    for (const link of invoice.linked_cos) {
      const { data: allLinksForCO } = await supabase
        .from('invoice_change_order_links')
        .select('invoice_id, amount_billed')
        .eq('change_order_id', link.changeOrderId)
        .neq('invoice_id', invoice.id);

      const remainingBilled = (allLinksForCO || [])
        .reduce((sum, l) => sum + (l.amount_billed || 0), 0);

      const co = changeOrders.find(c => c.id === link.changeOrderId);
      const coTotal = co ? Math.abs(co.change_amount) + (co.tax_amount || 0) : 0;

      let newStatus: string;
      if (remainingBilled <= 0) {
        newStatus = 'unbilled';
      } else if (coTotal > 0 && remainingBilled >= coTotal) {
        newStatus = 'fully_billed';
      } else {
        newStatus = 'partially_billed';
      }

      await supabase
        .from('change_orders')
        .update({ amount_billed: remainingBilled, billing_status: newStatus })
        .eq('id', link.changeOrderId);
    }
  }

  async function handleVoidInvoice(invoice: Invoice) {
    setActionLoading(true);
    try {
      await reverseCOBillingForInvoice(invoice);
      await supabase.from('invoice_change_order_links').delete().eq('invoice_id', invoice.id);
      const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', invoice.id);
      if (error) throw error;
      setVoidConfirm(null);
      await loadInvoices();
      onRefresh();
    } catch (err) {
      console.error('Error voiding invoice:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteInvoice(invoice: Invoice) {
    setActionLoading(true);
    try {
      await reverseCOBillingForInvoice(invoice);
      const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
      if (error) throw error;
      setDeleteConfirm(null);
      await loadInvoices();
      onRefresh();
    } catch (err) {
      console.error('Error deleting invoice:', err);
    } finally {
      setActionLoading(false);
    }
  }

  function canVoid(inv: Invoice) {
    if (inv.status === 'void') return false;
    if (inv.status === 'paid' || inv.status === 'partial') return canDeletePaidInvoices;
    return true;
  }

  function canDelete(inv: Invoice) {
    if (inv.status === 'paid' || inv.status === 'partial') return canDeletePaidInvoices;
    return true;
  }

  const approvedCOs = changeOrders.filter(co => co.status === 'approved' && co.is_billable !== false);
  const nonBillableApprovedCOs = changeOrders.filter(co => co.status === 'approved' && co.is_billable === false);

  const fullContractWithCOs = order.contract_total || 0;
  // Use the stored proposal total as the authoritative original contract baseline.
  // Never back-calculate from contract_total minus CO amounts — that produces wrong results
  // when the DB stored a running CO total in original_contract_total instead of the proposal total.
  const originalTotal = order.proposal?.total ?? order.original_contract_total ?? fullContractWithCOs;

  const activeInvoices = invoices.filter(inv => inv.status !== 'void');
  const voidedInvoices = invoices.filter(inv => inv.status === 'void');

  const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = activeInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  const totalOutstanding = activeInvoices.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
  const remainingToInvoice = Math.max(0, fullContractWithCOs - totalInvoiced);

  const paidPct = fullContractWithCOs > 0 ? Math.min(100, (totalPaid / fullContractWithCOs) * 100) : 0;
  const invoicedUnpaidPct = fullContractWithCOs > 0 ? Math.min(100 - paidPct, ((totalInvoiced - totalPaid) / fullContractWithCOs) * 100) : 0;

  const unbilledCOs = approvedCOs.filter(co => co.billing_status !== 'fully_billed');
  const totalCOBilled = approvedCOs.reduce((s, co) => s + (co.amount_billed || 0), 0);
  const originalInvoiced = Math.max(0, totalInvoiced - totalCOBilled);
  const originalRemaining = Math.max(0, originalTotal - originalInvoiced);

  const totalCORemaining = unbilledCOs.reduce((s, co) => {
    const isNegCO = (co.change_amount || 0) < 0;
    if (isNegCO) {
      const coTotal = (co.change_amount || 0) - Math.abs(co.tax_amount || 0);
      const rem = Math.min(0, coTotal - (co.amount_billed || 0));
      return s + rem;
    }
    return s + Math.max(0, (co.change_amount + (co.tax_amount || 0)) - (co.amount_billed || 0));
  }, 0);

  const pendingNegCOCredits = unbilledCOs
    .filter(co => (co.change_amount || 0) < 0)
    .reduce((s, co) => {
      const coTotal = (co.change_amount || 0) - Math.abs(co.tax_amount || 0);
      return s + Math.abs(Math.min(0, coTotal - (co.amount_billed || 0)));
    }, 0);

  const hasAnyOutstanding = originalRemaining > 0 || unbilledCOs.some(co => (co.change_amount || 0) >= 0) || pendingNegCOCredits > 0;

  function openBillAll() {
    const ids: string[] = [];
    if (originalRemaining > 0) ids.push('contract');
    unbilledCOs.forEach(co => ids.push(co.id));
    setPreSelectedIds(ids);
    setShowCreateModal(true);
  }

  function openBillCO(coId: string) {
    setPreSelectedIds([coId]);
    setShowCreateModal(true);
  }

  function openBillOriginal() {
    setPreSelectedIds(['contract']);
    setBillingScheduleAmount(undefined);
    setBillingScheduleTitle(undefined);
    setBillingSchedulePhaseId(undefined);
    setShowCreateModal(true);
  }

  function openBillScheduleEntry(entry: BillingScheduleEntry) {
    setPreSelectedIds(['contract']);
    setBillingScheduleAmount(entry.resolvedAmount);
    setBillingScheduleTitle(entry.title);
    setBillingSchedulePhaseId(entry.isSynthetic ? undefined : entry.id);
    setShowCreateModal(true);
  }

  function openCreateManual() {
    setPreSelectedIds([]);
    setBillingScheduleAmount(undefined);
    setBillingScheduleTitle(undefined);
    setBillingSchedulePhaseId(undefined);
    setShowCreateModal(true);
  }

  function handleInvoiceCreated(invoiceId: string) {
    setShowCreateModal(false);
    setPreSelectedIds([]);
    setBillingScheduleAmount(undefined);
    setBillingScheduleTitle(undefined);
    setBillingSchedulePhaseId(undefined);
    loadInvoices();
    onRefresh();
    setViewingInvoiceId(invoiceId);
  }

  function getInvoiceStatusStyle(status: string) {
    switch (status) {
      case 'paid': return { color: 'bg-green-500/20 text-green-400', icon: CheckCircle };
      case 'sent': return { color: 'bg-blue-500/20 text-blue-400', icon: Send };
      case 'partial': return { color: 'bg-amber-500/20 text-amber-400', icon: CreditCard };
      case 'overdue': return { color: 'bg-red-500/20 text-red-400', icon: AlertCircle };
      case 'void': return { color: 'bg-gray-600/30 text-gray-500', icon: Ban };
      default: return { color: 'bg-gray-500/20 text-gray-400', icon: Clock };
    }
  }

  function getCOBillingBadge(co: ChangeOrderSummary) {
    const isNeg = (co.change_amount || 0) < 0;
    if (co.billing_status === 'fully_billed') {
      return {
        label: isNeg ? 'Credit Issued' : 'Fully Billed',
        cls: 'bg-green-500/15 text-green-400 border border-green-500/25'
      };
    }
    if (co.billing_status === 'partially_billed') {
      return { label: 'Partial', cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' };
    }
    return {
      label: 'Unbilled',
      cls: isNeg
        ? 'bg-red-500/15 text-red-400 border border-red-500/25'
        : 'bg-gray-600/30 text-gray-400 border border-gray-600/30'
    };
  }

  function fmt(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const displayedInvoices = showVoided ? invoices : activeInvoices;

  return (
    <div className="space-y-5">

      {/* ─── Contract Breakdown ─── */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contract Breakdown</h3>
            {hasAnyOutstanding && (
              <button
                onClick={openBillAll}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white text-xs font-semibold rounded-lg transition-colors touch-manipulation"
              >
                <Zap className="w-3.5 h-3.5" />
                Bill All
              </button>
            )}
          </div>
        </div>

        {/* Original Sales Order Row */}
        <div className="px-4 py-3.5 border-b border-gray-700/40">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gray-700/60 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-white">Original Contract</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
                  Base
                </span>
              </div>
              {originalRemaining === 0 && originalTotal > 0 ? (
                <span className="text-xs text-green-400/80 mt-0.5 block">Fully invoiced</span>
              ) : (
                <span className="text-xs text-gray-500 mt-0.5 block">${fmt(originalTotal - originalRemaining)} invoiced</span>
              )}
            </div>
            <div className="shrink-0 w-28 text-right">
              <span className="text-base font-bold text-white">${fmt(originalTotal)}</span>
            </div>
            <div className="shrink-0 w-14 flex justify-end">
              {originalRemaining > 0 ? (
                <button
                  onClick={openBillOriginal}
                  className="flex items-center gap-1 px-3 py-2 min-h-[36px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors touch-manipulation"
                >
                  <DollarSign className="w-3 h-3" />
                  Bill
                </button>
              ) : originalTotal > 0 ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : null}
            </div>
          </div>
        </div>

        {/* Approved Billable Change Orders */}
        {approvedCOs.reduce<{ els: JSX.Element[]; running: number }>(({ els, running }, co) => {
          const badge = getCOBillingBadge(co);
          const isNegCO = (co.change_amount || 0) < 0;
          const coTotal = isNegCO
            ? (co.change_amount || 0) - Math.abs(co.tax_amount || 0)
            : Math.abs(co.change_amount || 0) + (co.tax_amount || 0);
          const runningAfter = running + coTotal;
          const remaining = isNegCO
            ? Math.min(0, coTotal - (co.amount_billed || 0))
            : Math.max(0, coTotal - (co.amount_billed || 0));
          const absCoTotal = Math.abs(coTotal);
          const absBilled = Math.abs(co.amount_billed || 0);
          const billedPct = absCoTotal > 0 ? Math.min(100, (absBilled / absCoTotal) * 100) : 0;
          const isFullyBilled = co.billing_status === 'fully_billed';
          const hasUnbilledCredit = isNegCO && !isFullyBilled && remaining < -0.001;
          const hasUnbilledPositive = !isNegCO && !isFullyBilled && remaining > 0.001;

          const el = (
            <div key={co.id} className={`px-4 py-3.5 border-b border-gray-700/40 last:border-b-0 transition-colors ${isFullyBilled ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isNegCO ? 'bg-red-500/15' : 'bg-green-500/15'}`}>
                  {isNegCO
                    ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    : <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-white">{co.change_order_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  {co.title && (
                    <p className="text-xs text-gray-500 truncate">{co.title}</p>
                  )}
                  {absBilled > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isFullyBilled ? 'bg-green-500' : isNegCO ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${billedPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">
                        {isNegCO ? `-$${fmt(absBilled)} credited` : `$${fmt(absBilled)} billed`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 w-28 text-right">
                  <span className={`text-base font-bold ${isNegCO ? 'text-red-400' : 'text-green-400'}`}>
                    {isNegCO ? `-$${fmt(Math.abs(coTotal))}` : `+$${fmt(coTotal)}`}
                  </span>
                  {(co.tax_amount || 0) !== 0 && (
                    <span className="text-xs text-gray-500 block">
                      {(co.tax_amount || 0) > 0 ? `+$${fmt(co.tax_amount)} tax` : `-$${fmt(Math.abs(co.tax_amount))} tax`}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 block mt-0.5">
                    =${fmt(runningAfter)} total
                  </span>
                </div>
                <div className="shrink-0 w-14 flex justify-end">
                  {(hasUnbilledPositive || hasUnbilledCredit) && !isFullyBilled ? (
                    <button
                      onClick={() => openBillCO(co.id)}
                      className="flex items-center gap-1 px-3 py-2 min-h-[36px] text-white text-xs font-semibold rounded-lg transition-colors touch-manipulation bg-blue-600 hover:bg-blue-500 active:bg-blue-700"
                    >
                      <DollarSign className="w-3 h-3" />
                      Bill
                    </button>
                  ) : isFullyBilled ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : null}
                </div>
              </div>
            </div>
          );
          return { els: [...els, el], running: runningAfter };
        }, { els: [], running: originalTotal }).els}

        {/* Non-billable approved COs */}
        {nonBillableApprovedCOs.length > 0 && (
          <div className="px-4 py-3 bg-gray-800/30 border-t border-gray-700/40">
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {nonBillableApprovedCOs.length} non-billable CO{nonBillableApprovedCOs.length > 1 ? 's' : ''} — internal only
                <span className="block mt-0.5 font-medium text-gray-400">
                  {nonBillableApprovedCOs.map(co => co.change_order_number).join(', ')}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Contract Total Footer */}
        <div className="px-4 py-4 bg-gray-800/30 border-t border-gray-600/50">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-300">Total Contract Value</span>
              {approvedCOs.length > 0 && (
                <span className="text-xs text-gray-500 ml-2">
                  ${fmt(originalTotal)} base + {approvedCOs.length} CO{approvedCOs.length > 1 ? 's' : ''}
                </span>
              )}
              {remainingToInvoice > 0 ? (
                <div className="text-xs text-amber-400/90 font-medium mt-0.5">${fmt(remainingToInvoice)} left to bill</div>
              ) : fullContractWithCOs > 0 ? (
                <div className="text-xs text-green-400/80 mt-0.5">Fully invoiced</div>
              ) : null}
            </div>
            <div className="shrink-0 w-28 text-right">
              <span className="text-xl font-bold text-white">${fmt(fullContractWithCOs)}</span>
            </div>
            <div className="shrink-0 w-14" />
          </div>
        </div>
      </div>

      {/* ─── Billing Schedule ─── */}
      {billingSchedule.length > 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Billing Schedule</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
                {billingSchedule.filter(e => e.status === 'unbilled').length} remaining
              </span>
            </div>
          </div>

          {scheduleLoading ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">Loading billing schedule...</div>
          ) : (
            <div>
              {billingSchedule
                .slice()
                .sort((a, b) => a.phase_order - b.phase_order)
                .map((entry, idx) => {
                  const isInvoiced = entry.status === 'invoiced';
                  return (
                    <div
                      key={entry.id}
                      className={`px-4 py-3.5 border-b border-gray-700/40 last:border-b-0 transition-colors ${isInvoiced ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          isInvoiced ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-semibold ${isInvoiced ? 'text-gray-400' : 'text-white'}`}>
                              {entry.title || `Schedule Entry ${idx + 1}`}
                            </span>
                            {isInvoiced ? (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-500/15 text-green-400 border border-green-500/25 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Billed
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-600/30 text-gray-400 border border-gray-600/30">
                                Unbilled
                              </span>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.notes}</p>
                          )}
                        </div>
                        <div className="shrink-0 w-28 text-right">
                          <span className="text-base font-bold text-white">${fmt(entry.resolvedAmount)}</span>
                          {entry.amount_type === 'percentage' && (
                            <span className="text-xs text-gray-500 block">{entry.amount}%</span>
                          )}
                        </div>
                        <div className="shrink-0 w-14 flex justify-end">
                          {isInvoiced ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openBillScheduleEntry(entry)}
                                className="flex items-center gap-1 px-3 py-2 min-h-[36px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors touch-manipulation"
                              >
                                <DollarSign className="w-3 h-3" />
                                Bill
                              </button>
                              {!entry.isSynthetic && (
                                <button
                                  onClick={() => setDeleteScheduleConfirm(entry)}
                                  className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors touch-manipulation"
                                  title="Remove this billing schedule entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total Invoiced" value={totalInvoiced} icon={Receipt} />
        <SummaryCard label="Total Paid" value={totalPaid} icon={CheckCircle} color="green" />
        <SummaryCard label="Outstanding" value={totalOutstanding} icon={AlertCircle} color={totalOutstanding > 0 ? 'amber' : 'green'} />
        <SummaryCard
          label="Left to Invoice"
          value={remainingToInvoice}
          icon={DollarSign}
          color={remainingToInvoice > 0 ? 'blue' : 'green'}
          subLabel={
            pendingNegCOCredits > 0
              ? `${fmt(pendingNegCOCredits)} in pending credits`
              : totalCORemaining > 0
              ? `Incl. $${fmt(totalCORemaining)} in COs`
              : undefined
          }
        />
      </div>

      {/* ─── Billing Progress ─── */}
      {fullContractWithCOs > 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
          <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
            <span>Billing Progress</span>
            <span>
              {Math.min(100, Math.round((totalInvoiced / fullContractWithCOs) * 100))}% invoiced
              · {Math.min(100, Math.round((totalPaid / fullContractWithCOs) * 100))}% paid
            </span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
            {paidPct > 0 && (
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${paidPct}%` }}
                title={`Paid: $${fmt(totalPaid)}`}
              />
            )}
            {invoicedUnpaidPct > 0 && (
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${invoicedUnpaidPct}%` }}
                title={`Invoiced (unpaid): $${fmt(totalInvoiced - totalPaid)}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              Paid ${fmt(totalPaid)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              Unpaid ${fmt(Math.max(0, totalInvoiced - totalPaid))}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-700 shrink-0" />
              Remaining ${fmt(remainingToInvoice)}
            </span>
          </div>
        </div>
      )}

      {/* ─── Invoices List ─── */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invoices</h3>
            {voidedInvoices.length > 0 && (
              <button
                onClick={() => setShowVoided(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors touch-manipulation"
              >
                {showVoided ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showVoided ? 'Hide voided' : `Voided (${voidedInvoices.length})`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeInvoices.length > 0 && (
              <button
                onClick={() => setShowTaxReport(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-600 active:bg-gray-500 transition-colors touch-manipulation"
              >
                <FileText className="w-4 h-4" />
                Tax Report
              </button>
            )}
            <button
              onClick={openCreateManual}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 text-sm">Loading invoices...</div>
        ) : displayedInvoices.length === 0 && activeInvoices.length === 0 ? (
          <div className="bg-gray-900/30 rounded-xl border border-gray-700/30 p-8 text-center">
            <Receipt className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No invoices created yet.</p>
            <button
              onClick={openCreateManual}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              Create First Invoice
            </button>
          </div>
        ) : (
          <div className="space-y-3" ref={openMenuId ? menuRef : undefined}>
            {displayedInvoices.map(inv => {
              const isCreditMemo = inv.invoice_type === 'credit_memo';
              const style = getInvoiceStatusStyle(inv.status);
              const StatusIcon = style.icon;
              const canPay = !isCreditMemo && inv.status !== 'paid' && inv.status !== 'void' && inv.amount_due > 0;
              const isVoided = inv.status === 'void';
              const showVoidOption = canVoid(inv);
              const showDeleteOption = canDelete(inv);
              const hasMenuOptions = showVoidOption || showDeleteOption;
              const invTotal = inv.total || 0;
              const displayTotal = isCreditMemo
                ? `-$${fmt(Math.abs(invTotal))}`
                : `$${fmt(invTotal)}`;

              return (
                <div
                  key={inv.id}
                  className={`rounded-xl border transition-colors overflow-hidden ${
                    isVoided
                      ? 'bg-gray-900/30 border-gray-700/30 opacity-50'
                      : isCreditMemo
                      ? 'bg-red-950/20 border-red-800/40 hover:border-red-600/60 cursor-pointer group'
                      : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-500 cursor-pointer group'
                  }`}
                  onClick={() => !isVoided && setViewingInvoiceId(inv.id)}
                >
                  <div className="p-4">
                    {/* Top row: number + status badge + menu */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className={`font-semibold text-base leading-tight ${isVoided ? 'text-gray-500 line-through' : isCreditMemo ? 'text-red-300' : 'text-white'}`}>
                          #{inv.invoice_number}
                        </span>
                        {isCreditMemo && !isVoided && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                            <TrendingDown className="w-3 h-3" />
                            Credit Memo
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {inv.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isVoided && (
                          <ChevronRight className={`w-4 h-4 transition-colors ${isCreditMemo ? 'text-red-600 group-hover:text-red-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                        )}
                        {hasMenuOptions && (
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === inv.id ? null : inv.id)}
                              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded-md transition-colors touch-manipulation"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === inv.id && (
                              <div className="absolute right-0 top-8 z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl min-w-[160px] overflow-hidden">
                                {showVoidOption && (
                                  <button
                                    onClick={() => { setVoidConfirm(inv); setOpenMenuId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-amber-400 hover:bg-gray-700/60 active:bg-gray-700 transition-colors touch-manipulation"
                                  >
                                    <Ban className="w-4 h-4" />
                                    Void Invoice
                                  </button>
                                )}
                                {showDeleteOption && (
                                  <button
                                    onClick={() => { setDeleteConfirm(inv); setOpenMenuId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-400 hover:bg-gray-700/60 active:bg-gray-700 transition-colors touch-manipulation"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Invoice
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    {inv.invoice_title && (
                      <p className={`text-sm mb-2 leading-snug ${isVoided ? 'text-gray-600' : isCreditMemo ? 'text-red-400/70' : 'text-gray-400'}`}>
                        {inv.invoice_title}
                      </p>
                    )}

                    {/* Credit memo note */}
                    {isCreditMemo && !isVoided && (
                      <p className="text-xs text-red-400/60 mb-2">
                        Reduces outstanding balance on this sales order
                      </p>
                    )}

                    {/* CO tags */}
                    {!isVoided && inv.linked_cos && inv.linked_cos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {inv.linked_cos.map((link, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              link.fullyBilled ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            {link.coNumber}{!link.fullyBilled ? ' (partial)' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Amount + dates row */}
                    <div className="flex items-end justify-between gap-2 flex-wrap">
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>Issued {new Date(inv.invoice_date).toLocaleDateString()}</div>
                        {inv.due_date && <div>Due {new Date(inv.due_date).toLocaleDateString()}</div>}
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold leading-tight ${isVoided ? 'text-gray-600 line-through' : isCreditMemo ? 'text-red-400' : 'text-white'}`}>
                          {displayTotal}
                        </div>
                        {!isVoided && !isCreditMemo && inv.amount_paid > 0 && inv.amount_paid < inv.total && (
                          <div className="text-xs text-green-400">Paid ${fmt(inv.amount_paid)}</div>
                        )}
                        {!isVoided && !isCreditMemo && inv.amount_due > 0 && (
                          <div className="text-xs text-amber-400 font-semibold">Due ${fmt(inv.amount_due)}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {canPay && (
                    <div className="border-t border-gray-700/50 px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setPaymentInvoice(inv)}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors touch-manipulation"
                      >
                        <DollarSign className="w-4 h-4" />
                        Record Payment — ${fmt(inv.amount_due)} due
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateSOInvoiceModal
          order={order}
          changeOrders={changeOrders.filter(co => co.status === 'approved' && co.is_billable !== false && co.billing_status !== 'fully_billed')}
          originalTotal={originalTotal}
          totalInvoiced={totalInvoiced}
          remainingToInvoice={remainingToInvoice}
          preSelectedIds={preSelectedIds}
          billingScheduleAmount={billingScheduleAmount}
          billingScheduleTitle={billingScheduleTitle}
          billingSchedulePhaseId={billingSchedulePhaseId}
          onClose={() => { setShowCreateModal(false); setPreSelectedIds([]); setBillingScheduleAmount(undefined); setBillingScheduleTitle(undefined); setBillingSchedulePhaseId(undefined); }}
          onSuccess={handleInvoiceCreated}
        />
      )}

      {paymentInvoice && (
        <RecordPaymentModal
          invoice={{
            id: paymentInvoice.id,
            invoice_number: paymentInvoice.invoice_number,
            contact_id: order.contact_id,
            total: paymentInvoice.total,
            amount_paid: paymentInvoice.amount_paid,
            amount_due: paymentInvoice.amount_due,
            contact_email: order.contact?.email,
          }}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            setPaymentInvoice(null);
            loadInvoices();
            onRefresh();
          }}
        />
      )}

      {viewingInvoiceId && (
        <InvoiceDetailModal
          invoiceId={viewingInvoiceId}
          onClose={() => setViewingInvoiceId(null)}
          onPaymentRecorded={() => { loadInvoices(); onRefresh(); }}
          onVoided={() => { setViewingInvoiceId(null); loadInvoices(); onRefresh(); }}
          onDeleted={() => { setViewingInvoiceId(null); loadInvoices(); onRefresh(); }}
        />
      )}

      {voidConfirm && (
        <ConfirmModal
          isOpen={!!voidConfirm}
          title="Void Invoice"
          message={`Void invoice #${voidConfirm.invoice_number}${voidConfirm.total ? ` ($${fmt(voidConfirm.total)})` : ''}? This will cancel the invoice, reverse any linked change order billing amounts so they can be re-billed. Any payments already recorded will remain as a credit on the customer account.`}
          variant="warning"
          confirmLabel={actionLoading ? 'Voiding...' : 'Void Invoice'}
          onConfirm={() => handleVoidInvoice(voidConfirm)}
          onCancel={() => setVoidConfirm(null)}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Invoice"
          message={`Permanently delete invoice #${deleteConfirm.invoice_number}${deleteConfirm.total ? ` ($${fmt(deleteConfirm.total)})` : ''}? This cannot be undone.${(deleteConfirm.status === 'paid' || deleteConfirm.status === 'partial') ? ' Payments recorded will remain as an unapplied credit.' : ''} Linked CO billing amounts will be reversed.`}
          variant="danger"
          confirmLabel={actionLoading ? 'Deleting...' : 'Delete Invoice'}
          onConfirm={() => handleDeleteInvoice(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {deleteScheduleConfirm && (
        <ConfirmModal
          isOpen={!!deleteScheduleConfirm}
          title="Remove Billing Schedule Entry"
          message={`Remove "${deleteScheduleConfirm.title || 'this entry'}" ($${fmt(deleteScheduleConfirm.resolvedAmount)}) from the billing schedule? This will permanently delete it.`}
          variant="danger"
          confirmLabel={actionLoading ? 'Removing...' : 'Remove Entry'}
          onConfirm={() => handleDeleteScheduleEntry(deleteScheduleConfirm)}
          onCancel={() => setDeleteScheduleConfirm(null)}
        />
      )}

      {showTaxReport && (
        <InvoiceTaxReport
          salesOrderId={order.id}
          taxEnvironment={(order.proposal?.tax_environment as TaxEnvironment) ?? 'residential'}
          taxProjectType={(order.proposal?.tax_project_type as TaxProjectType) ?? 'original_construction'}
          taxRate={order.contact?.tax_rate ?? 0.0935}
          onClose={() => setShowTaxReport(false)}
        />
      )}

      {actionLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <span className="text-white text-sm font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, subLabel }: {
  label: string; value: number; icon: typeof DollarSign; color?: string; subLabel?: string;
}) {
  const textColor = color === 'green' ? 'text-green-400' : color === 'amber' ? 'text-amber-400' : color === 'blue' ? 'text-blue-400' : 'text-white';
  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${textColor}`} />
        <span className="text-xs text-gray-500 leading-tight">{label}</span>
      </div>
      <div className={`text-lg font-bold ${textColor} leading-tight`}>
        ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {subLabel && (
        <div className="text-xs text-gray-600 mt-0.5 leading-tight">{subLabel}</div>
      )}
    </div>
  );
}
