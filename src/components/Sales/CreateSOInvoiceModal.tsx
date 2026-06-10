import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Save, AlertTriangle, Check, DollarSign, FileText, TrendingUp, TrendingDown,
  CreditCard as Edit2, Mail, Send, ExternalLink, CheckSquare, Square, ShieldAlert,
  CheckCircle, XCircle, Info, CreditCard
} from 'lucide-react';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';
import {
  getTaxApplicability, getEnvironmentDisplayName, getProjectTypeDisplayName,
  computeInvoiceTax,
  type TaxEnvironment, type TaxProjectType,
} from '../../lib/taxCalculations';

interface BillingRow {
  id: string;
  type: 'contract' | 'change_order';
  label: string;
  remainingAmount: number;
  selectedAmount: number;
  inputValue: string;
  isSelected: boolean;
  isNegative: boolean;
  coData?: ChangeOrderSummary;
}

interface CreateSOInvoiceModalProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
  originalTotal: number;
  totalInvoiced: number;
  remainingToInvoice: number;
  preSelectedIds?: string[];
  billingScheduleAmount?: number;
  billingScheduleTitle?: string;
  billingSchedulePhaseId?: string;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}

// Effective pre-selected IDs resolved before row construction
const effectivePreSelectedIds: string[] = [];

export function CreateSOInvoiceModal({
  order,
  changeOrders,
  originalTotal,
  totalInvoiced,
  remainingToInvoice,
  preSelectedIds = [],
  billingScheduleAmount,
  billingScheduleTitle,
  billingSchedulePhaseId,
  onClose,
  onSuccess,
}: CreateSOInvoiceModalProps) {
  const { profile } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const contractInvoiced = Math.max(
    0,
    totalInvoiced - changeOrders.reduce((s, co) => s + (co.amount_billed || 0), 0)
  );
  const contractRemainingAmount = Math.max(0, originalTotal - contractInvoiced);

  const contractIsPreSelected = preSelectedIds.includes('contract');
  const contractInitialAmount = billingScheduleAmount !== undefined
    ? Math.min(billingScheduleAmount, contractRemainingAmount)
    : contractRemainingAmount;
  const originalContractRow: BillingRow = {
    id: 'contract',
    type: 'contract',
    label: billingScheduleTitle
      ? billingScheduleTitle
      : `Progress billing up to ${todayFormatted}`,
    remainingAmount: contractRemainingAmount,
    selectedAmount: contractInitialAmount,
    inputValue: contractInitialAmount.toFixed(2),
    isSelected: contractIsPreSelected,
    isNegative: false,
  };

  const coRows: BillingRow[] = changeOrders
    .filter(co => co.status === 'approved' && co.billing_status !== 'fully_billed')
    .map(co => {
      const isNegCO = (co.change_amount || 0) < 0;
      const coTotal = isNegCO
        ? (co.change_amount || 0) - Math.abs(co.tax_amount || 0)
        : Math.abs(co.change_amount || 0) + (co.tax_amount || 0);
      const remaining = isNegCO
        ? Math.min(0, coTotal - (co.amount_billed || 0))
        : Math.max(0, coTotal - (co.amount_billed || 0));
      const isPreSelected = preSelectedIds.includes(co.id);
      return {
        id: co.id,
        type: 'change_order',
        label: `${co.change_order_number} - ${co.title}`,
        remainingAmount: remaining,
        selectedAmount: remaining,
        inputValue: Math.abs(remaining).toFixed(2),
        isSelected: isPreSelected,
        isNegative: isNegCO,
        coData: co,
      };
    });

  const allRows: BillingRow[] = [originalContractRow, ...coRows];

  function calcDueDate(fromDate: string, terms: string): string {
    if (!fromDate) return '';
    const d = new Date(fromDate + 'T00:00:00');
    switch (terms) {
      case 'due_on_receipt': return fromDate;
      case 'net_10': d.setDate(d.getDate() + 10); break;
      case 'net_15': d.setDate(d.getDate() + 15); break;
      case 'net_30': d.setDate(d.getDate() + 30); break;
      case 'net_45': d.setDate(d.getDate() + 45); break;
      case 'net_60': d.setDate(d.getDate() + 60); break;
      default: return '';
    }
    return d.toISOString().split('T')[0];
  }

  function normalizePaymentTerms(terms: string | undefined | null): string {
    if (!terms) return '';
    const map: Record<string, string> = {
      'net 10': 'net_10', 'net 15': 'net_15', 'net 30': 'net_30',
      'net 45': 'net_45', 'net 60': 'net_60',
      'due on receipt': 'due_on_receipt', 'cod': 'due_on_receipt', 'cash on delivery': 'due_on_receipt',
    };
    return map[terms.toLowerCase().trim()] || terms;
  }

  const initialTerms = normalizePaymentTerms(order.contact?.default_payment_terms) || normalizePaymentTerms(order.payment_terms) || '';

  const [rows, setRows] = useState<BillingRow[]>(allRows);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [invoiceTitle, setInvoiceTitle] = useState(billingScheduleTitle || '');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => calcDueDate(today, initialTerms));
  const [paymentTerms, setPaymentTerms] = useState(initialTerms);
  const [notes, setNotes] = useState('');
  const [overBillingConfirmed, setOverBillingConfirmed] = useState(false);
  const [creditMemoAccountConfirmed, setCreditMemoAccountConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showTaxConfirmation, setShowTaxConfirmation] = useState(false);
  const [checkingFirstInvoice, setCheckingFirstInvoice] = useState(false);
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Labor/material split derived from proposal line items
  const [proposalLaborPct, setProposalLaborPct] = useState(0.5);
  const [splitLoaded, setSplitLoaded] = useState(false);

  useEffect(() => {
    async function loadProposalSplit() {
      if (!order.proposal?.id) {
        setSplitLoaded(true);
        return;
      }
      const { data } = await supabase
        .from('proposal_line_items')
        .select('item_type, line_total, labor_total')
        .eq('proposal_id', order.proposal.id);
      if (!data || data.length === 0) {
        setSplitLoaded(true);
        return;
      }
      // labor_total column stores the labor portion of a material+labor line item
      // item_type === 'labor' means the whole line is labor
      let totalLabor = 0;
      let totalMaterial = 0;
      for (const item of data) {
        const lineTotal = item.line_total || 0;
        if (item.item_type === 'labor') {
          totalLabor += lineTotal;
        } else {
          const laborPart = item.labor_total || 0;
          totalLabor += laborPart;
          totalMaterial += lineTotal - laborPart;
        }
      }
      const combined = totalLabor + totalMaterial;
      if (combined > 0) {
        setProposalLaborPct(totalLabor / combined);
      }
      setSplitLoaded(true);
    }
    loadProposalSplit();
  }, [order.proposal?.id]);

  useEffect(() => {
    setDueDate(calcDueDate(invoiceDate, paymentTerms));
  }, [invoiceDate, paymentTerms]);

  const customerEmail = order.contact?.email || '';
  const hasCustomerEmail = !!customerEmail;

  const [taxEnv, setTaxEnv] = useState<TaxEnvironment>((order.proposal?.tax_environment || 'residential') as TaxEnvironment);
  const [taxProjType, setTaxProjType] = useState<TaxProjectType>((order.proposal?.tax_project_type || 'general_installation_repair') as TaxProjectType);
  const taxInfo = getTaxApplicability(taxEnv, taxProjType);
  const customerTaxRate = order.contact?.tax_rate;
  const customerTaxRateDisplay = customerTaxRate !== undefined && customerTaxRate !== null
    ? `${(customerTaxRate * 100).toFixed(4)}%`
    : '9.35% (default)';

  const taxRate = order.contact?.tax_rate || 0.0935;

  const selectedRows = rows.filter(r => r.isSelected);

  // For each selected row, compute labor and material portions using the proposal split
  function getRowLaborMaterialAmounts(row: BillingRow): { laborAmt: number; materialAmt: number } {
    const absAmt = Math.abs(row.selectedAmount);
    const sign = row.isNegative ? -1 : 1;
    return {
      laborAmt: sign * absAmt * proposalLaborPct,
      materialAmt: sign * absAmt * (1 - proposalLaborPct),
    };
  }

  // Compute invoice totals using the tax matrix
  function computeInvoiceTotals() {
    if (selectedRows.length === 0) return { subtotal: 0, taxAmount: 0, total: 0 };

    const lineInputs = selectedRows.flatMap(row => {
      const { laborAmt, materialAmt } = getRowLaborMaterialAmounts(row);
      return [
        { amount: laborAmt, itemType: 'labor' as const },
        { amount: materialAmt, itemType: 'material' as const },
      ];
    });

    return computeInvoiceTax({
      lineItems: lineInputs,
      environment: taxEnv,
      projectType: taxProjType,
      taxRate,
    });
  }

  const totals = computeInvoiceTotals();
  const invoiceTotal = totals.total;
  const invoiceSubtotal = totals.subtotal;
  const taxAmount = totals.taxAmount;

  const positiveSelectedRows = selectedRows.filter(r => r.selectedAmount > 0);
  const positiveTotal = positiveSelectedRows.reduce((s, r) => s + r.selectedAmount, 0);

  const selectedNegCOs = selectedRows.filter(r => r.isNegative && r.isSelected);
  const hasSelectedNegCO = selectedNegCOs.length > 0;
  const totalNegCOCredit = selectedNegCOs.reduce((s, r) => s + Math.abs(r.selectedAmount), 0);

  const isCreditMemoInvoice = invoiceTotal < -0.001;
  const absoluteInvoiceTotal = Math.abs(invoiceTotal);

  const remainingAfterInvoice = remainingToInvoice - invoiceSubtotal;
  const isOverBilling = !isCreditMemoInvoice && invoiceSubtotal > remainingToInvoice + 0.01;

  const futureBillingCapacity = Math.max(0, remainingToInvoice - positiveTotal);
  const absorbedByThisInvoice = Math.min(totalNegCOCredit, positiveTotal);
  const remainingCreditToAbsorb = Math.max(0, totalNegCOCredit - absorbedByThisInvoice);
  const canAbsorbOnSO = remainingCreditToAbsorb <= futureBillingCapacity + 0.01;

  const creditMemoType: 'so_credit' | 'account_credit' | null = isCreditMemoInvoice
    ? (canAbsorbOnSO ? 'so_credit' : 'account_credit')
    : null;

  const rowsWithOverMax = rows.filter(r => r.isSelected && !r.isNegative && r.selectedAmount > r.remainingAmount + 0.01);
  const hasRowOverMax = rowsWithOverMax.length > 0 && !overBillingConfirmed;

  const allAvailableSelected = rows.every(r => r.remainingAmount === 0 || r.isSelected);
  const anyAvailable = rows.some(r => r.remainingAmount !== 0);

  // Labor/material display for confirmation modal
  const proposalMaterialPct = 1 - proposalLaborPct;
  const effectiveTaxRateOnSubtotal = invoiceSubtotal > 0 ? taxAmount / invoiceSubtotal : 0;

  function toggleRow(id: string) {
    setRows(prev => prev.map(r =>
      r.id === id
        ? {
            ...r,
            isSelected: !r.isSelected,
            selectedAmount: !r.isSelected ? r.remainingAmount : r.selectedAmount,
            inputValue: !r.isSelected ? Math.abs(r.remainingAmount).toFixed(2) : r.inputValue,
          }
        : r
    ));
  }

  function selectAll() {
    setRows(prev => prev.map(r =>
      r.remainingAmount !== 0
        ? { ...r, isSelected: true, selectedAmount: r.remainingAmount, inputValue: Math.abs(r.remainingAmount).toFixed(2) }
        : r
    ));
  }

  function deselectAll() {
    setRows(prev => prev.map(r => ({ ...r, isSelected: false })));
  }

  function updateAmountInput(id: string, value: string) {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, inputValue: value } : r
    ));
  }

  function commitAmount(id: string, value: string) {
    const parsed = parseFloat(value);
    const absRaw = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (r.isNegative) {
        const absMax = Math.abs(r.remainingAmount);
        const absAmount = Math.min(absRaw, absMax);
        return { ...r, selectedAmount: -absAmount, inputValue: absAmount.toFixed(2) };
      }
      const amount = Math.min(absRaw, r.remainingAmount);
      return { ...r, selectedAmount: amount, inputValue: amount.toFixed(2) };
    }));
  }

  function updateLabel(id: string, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, label: value } : r));
  }

  async function handleCreateClick() {
    if (selectedRows.length === 0) return;
    if (isOverBilling && !overBillingConfirmed) return;
    if (creditMemoType === 'account_credit' && !creditMemoAccountConfirmed) return;

    setCheckingFirstInvoice(true);
    try {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('sales_order_id', order.id);

      if ((count ?? 0) === 0) {
        setShowTaxConfirmation(true);
      } else {
        await handleSubmit();
      }
    } catch {
      await handleSubmit();
    } finally {
      setCheckingFirstInvoice(false);
    }
  }

  async function handleSubmit() {
    if (selectedRows.length === 0) return;
    if (isOverBilling && !overBillingConfirmed) return;
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const selectedCORows = selectedRows.filter(r => r.type === 'change_order');
      const hasContractRow = selectedRows.some(r => r.type === 'contract');

      const autoTitle = isCreditMemoInvoice
        ? selectedCORows.length === 1
          ? `Credit Memo — ${selectedCORows[0].coData?.change_order_number}`
          : `Credit Memo`
        : selectedRows.length === 1 && selectedCORows.length === 1
            ? `${selectedCORows[0].coData?.change_order_number} - ${selectedCORows[0].coData?.title}`
            : hasContractRow && selectedCORows.length === 0
              ? selectedRows[0].label
              : selectedCORows.length > 0 && !hasContractRow
                ? selectedCORows.length === 1
                  ? `${selectedCORows[0].coData?.change_order_number} - ${selectedCORows[0].coData?.title}`
                  : `Change Orders Invoice`
                : `Progress Invoice`;

      const invoiceType = isCreditMemoInvoice ? 'credit_memo' : 'standard';

      // Recompute final totals at submit time (taxEnv/taxProjType may have been edited in confirmation modal)
      const finalTotals = computeInvoiceTotals();

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: profile?.organization_id || order.organization_id,
          organization_id: order.organization_id,
          contact_id: order.contact?.id || order.contact_id,
          project_id: order.project?.id || null,
          sales_order_id: order.id,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          status: 'draft',
          subtotal: finalTotals.subtotal,
          tax_amount: finalTotals.taxAmount,
          total: finalTotals.total,
          amount_paid: 0,
          amount_due: finalTotals.total,
          notes: notes || null,
          invoice_title: invoiceTitle || autoTitle,
          source_type: billingSchedulePhaseId ? 'billing_phase' : selectedCORows.length > 0 ? 'change_order' : 'progress',
          includes_change_orders: selectedCORows.length > 0,
          tax_environment: taxEnv,
          tax_project_type: taxProjType,
          payment_terms: paymentTerms || null,
          invoice_type: invoiceType,
          billing_phase_id: billingSchedulePhaseId || null,
          created_by: user.id,
          created_by_name: profile?.full_name || null,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const lineItems: any[] = [];
      const coLinks: any[] = [];
      let sortOrder = 0;

      const { partsTaxable, laborTaxable } = getTaxApplicability(taxEnv, taxProjType);

      for (const row of selectedRows) {
        const { laborAmt, materialAmt } = getRowLaborMaterialAmounts(row);

        // Labor line
        const laborTax = laborTaxable ? Math.abs(laborAmt) * taxRate * (laborAmt < 0 ? -1 : 1) : 0;
        lineItems.push({
          invoice_id: invoiceData.id,
          description: `${row.label} — Labor`,
          quantity: 1,
          unit_price: laborAmt,
          amount: laborAmt,
          item_type: 'labor',
          is_taxable: laborTaxable,
          tax_amount: laborTax,
          sort_order: sortOrder++,
        });

        // Material line
        const materialTax = partsTaxable ? Math.abs(materialAmt) * taxRate * (materialAmt < 0 ? -1 : 1) : 0;
        lineItems.push({
          invoice_id: invoiceData.id,
          description: `${row.label} — Materials`,
          quantity: 1,
          unit_price: materialAmt,
          amount: materialAmt,
          item_type: 'material',
          is_taxable: partsTaxable,
          tax_amount: materialTax,
          sort_order: sortOrder++,
        });

        if (row.type === 'change_order' && row.coData) {
          const isNeg = row.isNegative;
          const fullCOTotal = isNeg
            ? (row.coData.change_amount || 0) - Math.abs(row.coData.tax_amount || 0)
            : Math.abs(row.coData.change_amount || 0) + (row.coData.tax_amount || 0);
          const totalBilledAfter = (row.coData.amount_billed || 0) + row.selectedAmount;
          coLinks.push({
            company_id: profile?.organization_id || order.organization_id,
            invoice_id: invoiceData.id,
            change_order_id: row.id,
            amount_billed: row.selectedAmount,
            fully_billed: isNeg
              ? totalBilledAfter <= fullCOTotal + 0.01
              : totalBilledAfter >= fullCOTotal - 0.01,
          });
        }
      }

      if (lineItems.length > 0) {
        const { error: itemsError } = await supabase.from('invoice_line_items').insert(lineItems);
        if (itemsError) throw itemsError;
      }

      if (coLinks.length > 0) {
        const { error: linksError } = await supabase.from('invoice_change_order_links').insert(coLinks);
        if (linksError) throw linksError;

        for (const link of coLinks) {
          const co = changeOrders.find(c => c.id === link.change_order_id);
          const isNeg = (co?.change_amount || 0) < 0;
          const coTotal = co
            ? isNeg
              ? (co.change_amount || 0) - Math.abs(co.tax_amount || 0)
              : Math.abs(co.change_amount || 0) + (co.tax_amount || 0)
            : link.amount_billed;
          const previousBilled = co?.amount_billed || 0;
          const newAmountBilled = previousBilled + link.amount_billed;

          let newStatus: string;
          if (isNeg) {
            newStatus = newAmountBilled <= coTotal + 0.01 ? 'fully_billed' : 'partially_billed';
            if (newAmountBilled >= 0) newStatus = 'unbilled';
          } else {
            if (newAmountBilled <= 0) {
              newStatus = 'unbilled';
            } else if (coTotal > 0 && newAmountBilled >= coTotal - 0.01) {
              newStatus = 'fully_billed';
            } else {
              newStatus = 'partially_billed';
            }
          }

          await supabase
            .from('change_orders')
            .update({ amount_billed: newAmountBilled, billing_status: newStatus })
            .eq('id', link.change_order_id);
        }
      }

      if (isCreditMemoInvoice && creditMemoType === 'account_credit') {
        await supabase.from('customer_account_credits').insert({
          organization_id: order.organization_id,
          contact_id: order.contact?.id || order.contact_id,
          sales_order_id: order.id,
          source_invoice_id: invoiceData.id,
          amount: Math.abs(invoiceTotal),
          amount_applied: 0,
          status: 'open',
          notes: `Credit memo issued from SO #${order.order_number} — insufficient future billing to absorb on this sales order.`,
          created_by: user.id,
        });
      }

      if (sendToCustomer && hasCustomerEmail) {
        setSendStatus('sending');
        try {
          const { error: emailError } = await supabase.functions.invoke('send-invoice-email', {
            body: {
              invoiceId: invoiceData.id,
              customMessage: customMessage.trim() || undefined,
              skipDuplicateCheck: true,
            },
          });
          if (emailError) throw emailError;
          setSendStatus('sent');
        } catch (emailErr) {
          console.error('Error sending invoice email:', emailErr);
          setSendStatus('error');
        }
      }

      onSuccess(invoiceData.id);
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function fmt(n: number) {
    return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const needsAccountCreditAck = isCreditMemoInvoice && creditMemoType === 'account_credit' && !creditMemoAccountConfirmed;
  const canSubmit = selectedRows.length > 0
    && (!isOverBilling || overBillingConfirmed)
    && !hasRowOverMax
    && !needsAccountCreditAck
    && !submitting
    && !checkingFirstInvoice;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-2xl max-w-2xl w-full sm:my-8 border border-gray-700 flex flex-col max-h-[95dvh] sm:max-h-[90vh]">

        <div className="flex items-center justify-between px-4 py-3.5 sm:p-5 border-b border-gray-700 shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {isCreditMemoInvoice ? 'Create Credit Memo' : 'Create Invoice'}
              </h2>
              {isCreditMemoInvoice && (
                <span className="px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-medium flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  Credit
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              SO #{order.order_number} &mdash; {order.contact?.full_name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
              {isCreditMemoInvoice
                ? 'Net total is negative — this will create a credit memo.'
                : 'Enter the pre-tax amount to bill — tax is computed from the proposal\'s labor/material split.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-4 py-4 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1">

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <ContractStat label="Contract" value={originalTotal} color="default" />
            <ContractStat label="Invoiced" value={totalInvoiced} color="default" />
            <ContractStat label="Remaining" value={remainingToInvoice} color={remainingToInvoice > 0 ? 'blue' : 'green'} />
          </div>
          <p className="text-xs text-gray-500 sm:hidden">Enter the pre-tax amount — tax is added based on the labor/material split.</p>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300">What are you billing for?</h3>
              {anyAvailable && (
                <button
                  type="button"
                  onClick={allAvailableSelected ? deselectAll : selectAll}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {allAvailableSelected
                    ? <><Square className="w-3.5 h-3.5" /> Deselect All</>
                    : <><CheckSquare className="w-3.5 h-3.5" /> Select All</>
                  }
                </button>
              )}
            </div>

            <div className="space-y-2">
              {rows.map(row => {
                const isSelected = row.isSelected;
                const isNeg = row.isNegative;
                const isPartial = isSelected && !isNeg && row.selectedAmount < row.remainingAmount && row.selectedAmount > 0;
                const isOverMax = isSelected && !isNeg && row.selectedAmount > row.remainingAmount + 0.01;
                const coRemaining = row.type === 'change_order' && isSelected && !isNeg
                  ? row.remainingAmount - row.selectedAmount
                  : 0;

                return (
                  <div
                    key={row.id}
                    className={`rounded-lg border transition-colors ${
                      isOverMax ? 'bg-red-500/10 border-red-500/50' :
                      isSelected && isNeg ? 'bg-red-600/10 border-red-500/30' :
                      isSelected ? 'bg-blue-600/10 border-blue-500/40' : 'bg-gray-900/50 border-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => toggleRow(row.id)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? isNeg ? 'border-red-500 bg-red-500' : 'border-blue-500 bg-blue-500'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        {row.type === 'change_order' ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isNeg
                              ? <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              : <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            }
                            <span className="text-sm text-white">{row.label}</span>
                            {row.coData?.billing_status === 'partially_billed' && (
                              <span className="text-xs text-amber-400 shrink-0">
                                (${fmt(row.coData.amount_billed || 0)} prev.)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {editingLabelId === row.id ? (
                              <input
                                autoFocus
                                value={row.label}
                                onChange={e => updateLabel(row.id, e.target.value)}
                                onBlur={() => setEditingLabelId(null)}
                                onKeyDown={e => e.key === 'Enter' && setEditingLabelId(null)}
                                className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                              />
                            ) : (
                              <span className="text-sm text-white">{row.label}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingLabelId(row.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Edit label"
                            >
                              <Edit2 className="w-3 h-3 text-gray-400 hover:text-gray-200" />
                            </button>
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5 ml-5">
                          Remaining: {isNeg ? '-' : ''}${fmt(row.remainingAmount)}
                        </div>
                        {isPartial && row.type === 'change_order' && coRemaining > 0.01 && (
                          <div className="text-xs text-amber-400/80 mt-0.5 ml-5">
                            ${fmt(coRemaining)} left on this CO
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 w-28 sm:w-36">
                        {isSelected ? (
                          <div className="relative">
                            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-sm ${isNeg ? 'text-red-400' : 'text-gray-400'}`}>
                              {isNeg ? '-$' : '$'}
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.inputValue}
                              onChange={e => updateAmountInput(row.id, e.target.value)}
                              onFocus={e => e.target.select()}
                              onBlur={e => commitAmount(row.id, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                              placeholder="0.00"
                              className={`w-full pl-7 pr-2 py-2 sm:py-1.5 bg-gray-700 border rounded text-sm text-right focus:outline-none ${
                                isOverMax
                                  ? 'border-red-500 focus:ring-1 focus:ring-red-500 text-white'
                                  : isNeg
                                    ? 'border-red-500/40 focus:ring-1 focus:ring-red-500 text-red-300'
                                    : isPartial
                                      ? 'border-amber-500/60 focus:ring-1 focus:ring-amber-500 text-white'
                                      : 'border-gray-600 focus:ring-1 focus:ring-blue-500 text-white'
                              }`}
                            />
                          </div>
                        ) : (
                          <div className={`text-sm text-right pr-1 ${isNeg ? 'text-red-400' : 'text-gray-500'}`}>
                            {isNeg ? '-' : ''}${fmt(row.remainingAmount)}
                          </div>
                        )}
                        {isOverMax && (
                          <div className="text-xs text-red-400 text-right mt-0.5 pr-1">
                            Max: ${fmt(row.remainingAmount)}
                          </div>
                        )}
                      </div>
                    </div>

                    {isOverMax && (
                      <div className="px-3 pb-2.5 pt-0">
                        <div className="ml-8 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-md px-2.5 py-1.5">
                          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                          <span className="text-xs text-red-300">
                            Amount exceeds the remaining balance of ${fmt(row.remainingAmount)} &mdash; reduce the amount or confirm over-billing below
                          </span>
                        </div>
                      </div>
                    )}
                    {!isOverMax && isPartial && row.type === 'change_order' && !isNeg && (
                      <div className="px-3 pb-2.5 pt-0">
                        <div className="ml-8 flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-md px-2.5 py-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-xs text-amber-300">
                            Partial billing &mdash; ${fmt(coRemaining)} remaining on this CO after invoice
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedRows.length > 0 && (
            <div className={`rounded-lg border p-4 space-y-2 text-sm ${
              isCreditMemoInvoice ? 'bg-red-900/20 border-red-700/40' : 'bg-gray-900/50 border-gray-700/50'
            }`}>
              {/* Labor/material breakdown */}
              {splitLoaded && (
                <div className="flex justify-between text-gray-500 text-xs pb-1">
                  <span>
                    Split: {(proposalLaborPct * 100).toFixed(0)}% labor / {(proposalMaterialPct * 100).toFixed(0)}% materials
                    {taxInfo.laborTaxable !== taxInfo.partsTaxable && (
                      <span className="ml-1 text-amber-400/80">
                        ({taxInfo.partsTaxable ? 'materials taxed' : 'neither taxed'}{taxInfo.laborTaxable ? ', labor taxed' : ''})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-600">from proposal</span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>Pre-tax subtotal</span>
                <span className={isCreditMemoInvoice ? 'text-red-300' : 'text-white'}>
                  {isCreditMemoInvoice ? '-' : ''}${fmt(invoiceSubtotal)}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>
                  Sales tax
                  {invoiceSubtotal > 0 && (
                    <span className="ml-1 text-gray-600 text-xs">
                      ({(effectiveTaxRateOnSubtotal * 100).toFixed(2)}% effective)
                    </span>
                  )}
                </span>
                <span className={isCreditMemoInvoice ? 'text-red-300' : 'text-white'}>
                  {isCreditMemoInvoice ? '-' : ''}${fmt(taxAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="font-semibold text-white">
                  {isCreditMemoInvoice ? 'Credit Memo Total' : 'Invoice Total'}
                </span>
                <span className={`text-xl font-bold ${isCreditMemoInvoice ? 'text-red-400' : 'text-green-400'}`}>
                  {isCreditMemoInvoice ? '-' : ''}${fmt(invoiceTotal)}
                </span>
              </div>
              {!isCreditMemoInvoice && (
                <div className={`flex justify-between pt-1 ${remainingAfterInvoice < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  <span>Remaining after this invoice</span>
                  <span className="font-medium">
                    ${fmt(Math.abs(remainingAfterInvoice))}{remainingAfterInvoice < 0 ? ' over' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasSelectedNegCO && !isCreditMemoInvoice && (
            <div className="rounded-lg border p-4 bg-gray-900/60 border-gray-700/60">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-300">Negative change order included</p>
                  <p className="text-xs text-gray-500 mt-1">
                    The <strong className="text-gray-400">-${fmt(totalNegCOCredit)}</strong> credit CO will appear as a deduction line on this standard invoice. The net invoice total already reflects the reduction — no separate credit memo is needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isCreditMemoInvoice && creditMemoType && (
            <div className={`rounded-lg border p-4 ${
              creditMemoType === 'so_credit'
                ? 'bg-blue-500/8 border-blue-500/25'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className="flex items-start gap-3">
                {creditMemoType === 'so_credit'
                  ? <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                }
                <div className="flex-1">
                  {creditMemoType === 'so_credit' ? (
                    <>
                      <p className="text-sm font-medium text-blue-300">Credit memo — applied against future billing</p>
                      <p className="text-xs text-blue-400/80 mt-1">
                        This sales order has <strong className="text-blue-300">${fmt(futureBillingCapacity)}</strong> in future billing capacity, which is enough to absorb the{' '}
                        <strong className="text-blue-300">${fmt(totalNegCOCredit)}</strong> credit. A credit memo will be created and linked to this sales order. No separate customer account credit is needed.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-amber-300">Credit memo — issued to customer account</p>
                      <p className="text-xs text-amber-400/80 mt-1">
                        This sales order only has <strong className="text-amber-300">${fmt(futureBillingCapacity)}</strong> in future billing capacity, which is not enough to absorb the{' '}
                        <strong className="text-amber-300">${fmt(totalNegCOCredit)}</strong> credit. A customer account credit of <strong className="text-amber-300">${fmt(totalNegCOCredit)}</strong> will be recorded and visible on the customer&apos;s profile for use against future invoices.
                      </p>
                      <label className="flex items-center gap-2 mt-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={creditMemoAccountConfirmed}
                          onChange={e => setCreditMemoAccountConfirmed(e.target.checked)}
                          className="w-4 h-4 rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-xs text-amber-300">I understand a customer account credit will be issued</span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {isOverBilling && !isCreditMemoInvoice && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-300">Over-billing warning</p>
                  <p className="text-xs text-amber-400/80 mt-1">
                    This invoice exceeds the remaining contract balance by ${fmt(Math.abs(remainingAfterInvoice))}.
                  </p>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overBillingConfirmed}
                      onChange={e => setOverBillingConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs text-amber-300">I understand this exceeds the contract balance</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {isCreditMemoInvoice ? 'Credit Memo Title' : 'Invoice Title'}{' '}
                <span className="text-gray-600">(optional — auto-generated if blank)</span>
              </label>
              <input
                type="text"
                value={invoiceTitle}
                onChange={e => setInvoiceTitle(e.target.value)}
                placeholder={isCreditMemoInvoice ? 'e.g. Credit Memo — CO #5' : 'e.g. Progress Invoice #2'}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {isCreditMemoInvoice ? 'Credit Memo Date' : 'Invoice Date'}
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              {!isCreditMemoInvoice && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">No terms</option>
                    <option value="due_on_receipt">Due on Receipt</option>
                    <option value="net_10">Net 10</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                    <option value="net_45">Net 45</option>
                    <option value="net_60">Net 60</option>
                  </select>
                </div>
              )}
            </div>

            {!isCreditMemoInvoice && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Due Date
                  {dueDate && paymentTerms && (
                    <span className="ml-2 text-xs text-blue-400 font-normal">auto-calculated from terms</span>
                  )}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder={isCreditMemoInvoice ? 'Reason for credit...' : 'Optional notes for this invoice...'}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
              />
            </div>
          </div>

          <div className={`rounded-lg border transition-colors ${
            sendToCustomer ? 'bg-blue-600/10 border-blue-500/40' : 'bg-gray-900/40 border-gray-700/50'
          }`}>
            <button
              type="button"
              onClick={() => setSendToCustomer(v => !v)}
              disabled={!hasCustomerEmail}
              className="w-full flex items-center gap-3 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                sendToCustomer ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
              }`}>
                {sendToCustomer && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-sm font-medium text-white">
                    Email this {isCreditMemoInvoice ? 'credit memo' : 'invoice'} to the customer
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 ml-6">
                  {hasCustomerEmail
                    ? <>Sends to <span className="text-gray-400">{customerEmail}</span></>
                    : 'No email address on file for this contact'
                  }
                </p>
              </div>
            </button>

            {sendToCustomer && hasCustomerEmail && (
              <div className="px-4 pb-4 space-y-3 border-t border-blue-500/20 pt-3">
                <div className="flex items-start gap-2 bg-blue-500/10 rounded-lg px-3 py-2.5">
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300">
                    The email will include a <strong>portal link</strong> where the customer can view and download the {isCreditMemoInvoice ? 'credit memo' : 'invoice'}.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Custom message <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    rows={2}
                    placeholder="Add a personal note..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs resize-none"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3.5 sm:p-5 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 sm:py-2 text-center text-gray-400 hover:text-white transition-colors text-sm border border-gray-700 sm:border-transparent rounded-lg sm:rounded-none"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateClick}
            disabled={!canSubmit}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm ${
              isCreditMemoInvoice
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : sendToCustomer
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {isCreditMemoInvoice ? <CreditCard className="w-4 h-4" /> : sendToCustomer ? <Send className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {checkingFirstInvoice
              ? 'Checking...'
              : submitting
                ? isCreditMemoInvoice ? 'Creating Credit Memo...' : sendToCustomer ? 'Creating & Sending...' : 'Creating...'
                : isCreditMemoInvoice ? 'Create Credit Memo' : sendToCustomer ? 'Create & Send to Customer' : 'Create Invoice'
            }
          </button>
        </div>
      </div>

      {showTaxConfirmation && !isCreditMemoInvoice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Tax Settings</h3>
                  <p className="text-sm text-gray-500">This is the first invoice for this sales order</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Once this invoice is created, the tax settings below will be <span className="font-semibold text-gray-900">permanently locked</span> for all future invoices on this sales order. Please verify they are correct before proceeding.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-200">
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <span className="text-sm font-medium text-gray-600 shrink-0">Environment</span>
                  <select
                    value={taxEnv}
                    onChange={e => setTaxEnv(e.target.value as TaxEnvironment)}
                    className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <span className="text-sm font-medium text-gray-600 shrink-0">Project Type</span>
                  <select
                    value={taxProjType}
                    onChange={e => setTaxProjType(e.target.value as TaxProjectType)}
                    className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  >
                    <option value="original_construction">Original Construction</option>
                    <option value="remodel">Remodel</option>
                    <option value="general_installation_repair">General Installation / Repair</option>
                    <option value="exempt_project">Exempt Project</option>
                    <option value="design_services">Design Services</option>
                    <option value="maintenance_agreement">Maintenance Agreement</option>
                    <option value="membership">Membership</option>
                    <option value="security_monitoring">Security Monitoring</option>
                  </select>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">Customer Tax Rate</span>
                  <span className="text-sm font-semibold text-gray-900">{customerTaxRateDisplay}</span>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tax applicability under these settings</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {taxInfo.partsTaxable
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                    }
                    <span className="text-sm text-gray-700">Parts/Materials: <span className="font-medium">{taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {taxInfo.laborTaxable
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                    }
                    <span className="text-sm text-gray-700">Labor: <span className="font-medium">{taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}</span></span>
                  </div>
                  <p className="text-xs text-gray-500 italic mt-2">{taxInfo.explanation}</p>
                </div>
              </div>

              {/* Labor/material split from proposal */}
              {splitLoaded && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Proposal labor/material split</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-blue-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${proposalLaborPct * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-blue-800 shrink-0 tabular-nums">
                      {(proposalLaborPct * 100).toFixed(0)}% labor / {(proposalMaterialPct * 100).toFixed(0)}% materials
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    Each billing draw will be split by this ratio. Tax is applied only to taxable portions per the matrix above.
                  </p>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Changes saved automatically.</span> Any adjustments made here will also update the linked proposal&apos;s tax settings.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-gray-200">
              <button
                onClick={() => setShowTaxConfirmation(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Go Back and Edit
              </button>
              <button
                onClick={async () => {
                  if (order.proposal?.id) {
                    await supabase.from('proposals').update({
                      tax_environment: taxEnv,
                      tax_project_type: taxProjType,
                    }).eq('id', order.proposal.id);
                  }
                  setShowTaxConfirmation(false);
                  handleSubmit();
                }}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {submitting ? 'Creating...' : 'Confirm and Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractStat({ label, value, color }: { label: string; value: number; color: 'default' | 'blue' | 'green' }) {
  const textColor = color === 'blue' ? 'text-blue-400' : color === 'green' ? 'text-green-400' : 'text-white';
  return (
    <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-2.5 sm:p-3 text-center">
      <div className="text-xs text-gray-500 mb-1 leading-tight">{label}</div>
      <div className={`text-sm sm:text-base font-bold ${textColor} tabular-nums`}>
        ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
